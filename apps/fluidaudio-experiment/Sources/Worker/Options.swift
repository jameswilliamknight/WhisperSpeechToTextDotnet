import Foundation

struct Options {
    var input: URL?
    var output: URL?
    var model = "ultra"
    var prepareOnly = false
    var offline = false

    static let usage = "worker --input /absolute/working-copy.wav --output /absolute/result.json [--asr ultra|v3] [--offline]\nworker --prepare-models [--asr ultra|v3]"

    init(_ args: [String]) throws {
        var index = 0
        while index < args.count {
            let key = args[index]
            if key == "--prepare-models" { prepareOnly = true; index += 1; continue }
            if key == "--offline" { offline = true; index += 1; continue }
            guard index + 1 < args.count else { throw WorkerError(Self.usage) }
            let value = args[index + 1]
            switch key {
            case "--input": input = try Self.absoluteURL(value)
            case "--output": output = try Self.absoluteURL(value)
            case "--asr": model = value
            default: throw WorkerError(Self.usage)
            }
            index += 2
        }
        guard ["ultra", "v3"].contains(model) else { throw WorkerError("ASR must be ultra or v3") }
        if prepareOnly {
            guard input == nil, output == nil else { throw WorkerError(Self.usage) }
            return
        }
        guard let input, let output else { throw WorkerError(Self.usage) }
        guard input.pathExtension.lowercased() == "wav" else { throw WorkerError("Input must be WAV") }
        guard input.resolvingSymlinksInPath() != output.resolvingSymlinksInPath() else {
            throw WorkerError("Input and output must differ")
        }
        // Refusing existing output also protects hard-linked input files and previous results.
        guard !FileManager.default.fileExists(atPath: output.path) else {
            throw WorkerError("Output must not already exist")
        }
        guard FileManager.default.isReadableFile(atPath: input.path) else {
            throw WorkerError("Input is not readable")
        }
    }

    private static func absoluteURL(_ value: String) throws -> URL {
        guard value.hasPrefix("/") else { throw WorkerError("Paths must be absolute") }
        let url = URL(fileURLWithPath: value).standardizedFileURL
        // Reject the forbidden original-recording tree before any input file is opened.
        func forbidden(_ url: URL) -> Bool {
            url.path == "/Users/james/Recordings" || url.path.hasPrefix("/Users/james/Recordings/")
        }
        guard !forbidden(url) else { throw WorkerError("Use a working copy, never the original-recording tree") }
        guard !forbidden(url.resolvingSymlinksInPath()) else { throw WorkerError("Working copy cannot link to originals") }
        return url
    }
}
