import Foundation
import Normalization

@main
struct AlignmentTests {
    static func check(_ condition: Bool, _ message: String) throws {
        if !condition { throw Failure(message: message) }
    }
    struct Failure: Error { let message: String }

    static func main() throws {
        let overlapping = [Turn(start: 0, end: 2, speaker: "A"), Turn(start: 1, end: 4, speaker: "B")]
        let result = align(words: [Segment(start: 1.5, end: 3, text: "hello")], turns: overlapping)
        try check(result[0].speaker == "B", "greatest overlap")
        try check(overlapping.count == 2, "raw overlapping turns retained")

        let turns = [Turn(start: 0, end: 1, speaker: "A")]
        let gaps = [Segment(start: 1, end: 2, text: "gap"), Segment(start: 0.5, end: 0.5, text: "zero")]
        try check(align(words: gaps, turns: turns).allSatisfy { $0.speaker == nil }, "no invented speaker")

        let duplicates = [Turn(start: 0, end: 1, speaker: "B"), Turn(start: 0, end: 1, speaker: "B"),
                          Turn(start: 0, end: 1.5, speaker: "A")]
        try check(align(words: [Segment(start: 0, end: 2, text: "word")], turns: duplicates)[0].speaker == "A",
                  "duplicate turns must not bias assignment")
        try check(align(words: [Segment(start: 0, end: 0.5, text: "tie")], turns: duplicates)[0].speaker == "A",
                  "lexical tie break")
        let data = try JSONEncoder().encode(Segment(start: 1.25, end: 2.5, text: "word"))
        let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        try check(value?["start"] as? Double == 1.25, "second offsets")
        try check(value?["speaker"] == nil, "omit unknown speaker")
        print("PASS: 7 normalization/alignment checks")
    }
}
