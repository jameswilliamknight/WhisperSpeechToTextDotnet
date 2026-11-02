import Foundation
import Normalization

struct WorkerResult: Encodable {
    var segments: [Segment]
    var turns: [Turn]
    var stages: Stages
    var metadata: Metadata
    var warnings: [String]

    struct Stages: Encodable {
        var transcriptionSeconds: Double
        var diarisationSeconds: Double
    }
    struct Metadata: Encodable {
        var runtime: String
        var models: [String]
        var backend: String
    }
}

func progress(_ message: String) {
    try? FileHandle.standardError.write(contentsOf: Data((message + "\n").utf8))
}

struct WorkerError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}
