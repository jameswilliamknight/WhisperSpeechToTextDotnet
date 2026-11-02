import Darwin
import FluidAudio
import Foundation
import Normalization

@main
struct Worker {
    static func main() async {
        // SDK disk-backed audio conversion must not create world-readable counselling excerpts.
        _ = umask(0o077)
        // Some upstream helpers print download status; stdout is never a transcript channel.
        let sink = open("/dev/null", O_WRONLY)
        if sink >= 0 { _ = dup2(sink, STDOUT_FILENO); close(sink) }
        AppLogger.minimumLevel = .warning
        do {
            if CommandLine.arguments.dropFirst().contains("--version") {
                progress("worker 1.0; FluidAudio e396cf780c4abf8e395087467c0585d3b0d17f68; Swift 6.4 arm64")
                return
            }
            let options = try Options(Array(CommandLine.arguments.dropFirst()))
            ModelHub.offlineMode = options.offline
            let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
            let cache = root.appendingPathComponent(".cache", isDirectory: true)
            let temporary = cache.appendingPathComponent("tmp", isDirectory: true)
            try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: temporary.path)
            setenv("TMPDIR", temporary.path + "/", 1)
            let version: AsrModelVersion = options.model == "ultra" ? .ultra : .v3
            let asrCache = cache.appendingPathComponent("asr-" + options.model)
            let diarCache = cache.appendingPathComponent("diarizer")
            if options.prepareOnly {
                progress("Preparing ASR models (download/load, no recording inference)")
                _ = try await AsrModels.downloadAndLoad(to: asrCache, version: version)
                progress("Preparing Community-1 models")
                _ = try await OfflineDiarizerModels.load(from: diarCache)
                progress("Models ready")
                return
            }
            guard let input = options.input, let output = options.output else { throw WorkerError(Options.usage) }
            let clock = ContinuousClock()
            let start = clock.now
            progress("Transcription: loading model and processing complete WAV")
            let asr = try await transcribe(input, cache: asrCache, version: version)
            let transcriptionSeconds = seconds(start.duration(to: clock.now))
            let diarStart = clock.now
            progress("Diarisation: loading Community-1 and processing complete WAV")
            let turns = try await diarize(input, cache: diarCache)
            let diarisationSeconds = seconds(diarStart.duration(to: clock.now))
            let words = buildWordTimings(from: asr.tokenTimings ?? []).map {
                Segment(start: $0.startTime, end: $0.endTime, text: $0.word)
            }
            // Static caveat lives here rather than in per-run output: speaker assignment
            // uses greatest word/turn overlap, with overlapping turns preserved; it is
            // not native joint ASR speaker assignment or cross-talk recovery.
            var warnings: [String] = []
            var segments = align(words: words, turns: turns)
            if words.isEmpty, !asr.text.isEmpty {
                // Do not fabricate fine-grained timings or assign one speaker to a whole recording.
                segments = [Segment(start: 0, end: asr.duration, text: asr.text)]
                warnings.append("ASR supplied no token timings; whole-file text has no speaker assignment.")
            }
            if segments.contains(where: { $0.speaker == nil }) {
                warnings.append("Some transcript spans have no positively overlapping diarisation turn.")
            }
            let result = WorkerResult(segments: segments, turns: turns,
                stages: .init(transcriptionSeconds: transcriptionSeconds, diarisationSeconds: diarisationSeconds),
                metadata: .init(runtime: "Swift 6.4 / macOS arm64; FluidAudio e396cf780c4abf8e395087467c0585d3b0d17f68",
                    models: [options.model == "ultra" ? "FluidInference/parakeet-ultra-coreml" : "FluidInference/parakeet-tdt-0.6b-v3-coreml",
                             "FluidInference/speaker-diarization-coreml (Community-1 offline)"],
                    backend: "CoreML / Apple Silicon; ASR CPU+ANE, diarizer default compute units"), warnings: warnings)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            // withoutOverwriting prevents a concurrent creator from turning the output into input.
            try encoder.encode(result).write(to: output, options: .withoutOverwriting)
            progress("Complete: normalized JSON written")
        } catch {
            progress("worker failed: \(error)")
            exit(1)
        }
    }

    /// Scope model lifetimes to each stage rather than holding two pipelines in RAM together.
    private static func transcribe(_ input: URL, cache: URL, version: AsrModelVersion) async throws -> ASRResult {
        let models = try await AsrModels.downloadAndLoad(to: cache, version: version)
        let manager = AsrManager(config: .default)
        try await manager.loadModels(models)
        var state = TdtDecoderState.make(decoderLayers: version.decoderLayers)
        do {
            let result = try await manager.transcribe(input, decoderState: &state)
            await manager.cleanup()
            return result
        } catch {
            await manager.cleanup()
            throw error
        }
    }

    private static func diarize(_ input: URL, cache: URL) async throws -> [Turn] {
        let manager = OfflineDiarizerManager(config: .default)
        // Explicit load respects offline mode without prepareModels' purge-and-redownload recovery.
        let models = try await OfflineDiarizerModels.load(from: cache)
        manager.initialize(models: models)
        let result = try await manager.process(input)
        return result.segments.map {
            Turn(start: Double($0.startTimeSeconds), end: Double($0.endTimeSeconds), speaker: $0.speakerId)
        }
    }

    private static func seconds(_ duration: Duration) -> Double {
        Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18
    }
}
