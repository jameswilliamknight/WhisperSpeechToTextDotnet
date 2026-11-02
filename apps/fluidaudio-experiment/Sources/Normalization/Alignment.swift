import Foundation

public struct Segment: Codable, Sendable, Equatable {
    public var start: Double
    public var end: Double
    public var text: String
    public var speaker: String?

    public init(start: Double, end: Double, text: String, speaker: String? = nil) {
        self.start = start
        self.end = end
        self.text = text
        self.speaker = speaker
    }
}

public struct Turn: Codable, Sendable, Equatable {
    public var start: Double
    public var end: Double
    public var speaker: String

    public init(start: Double, end: Double, speaker: String) {
        self.start = start
        self.end = end
        self.speaker = speaker
    }
}

/// Assign only positive temporal overlap; silence gaps must not invent a speaker.
/// Sum interval unions per speaker so duplicate/overlapping turns cannot inflate scores.
/// Ties are deterministic (lexical ID), not evidence of cross-talk recovery.
public func align(words: [Segment], turns: [Turn]) -> [Segment] {
    words.map { word in
        var intervals: [String: [(Double, Double)]] = [:]
        for turn in turns {
            let start = max(word.start, turn.start)
            let end = min(word.end, turn.end)
            if end > start { intervals[turn.speaker, default: []].append((start, end)) }
        }
        var scores: [(String, Double)] = []
        for (speaker, spans) in intervals {
            var total = 0.0
            var right = -Double.infinity
            for (start, end) in spans.sorted(by: { $0.0 < $1.0 }) {
                total += max(0, end - max(start, right))
                right = max(right, end)
            }
            scores.append((speaker, total))
        }
        let selected = scores.sorted { a, b in a.1 == b.1 ? a.0 < b.0 : a.1 > b.1 }.first?.0
        return Segment(start: word.start, end: word.end, text: word.text, speaker: selected)
    }
}
