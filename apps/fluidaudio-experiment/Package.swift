// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "FluidAudioExperiment",
    platforms: [.macOS(.v15)],
    products: [.executable(name: "worker", targets: ["Worker"])],
    dependencies: [
        // Immutable upstream revision; omit TTS and NeMo to keep this experiment small.
        .package(url: "https://github.com/FluidInference/FluidAudio.git",
                 revision: "e396cf780c4abf8e395087467c0585d3b0d17f68", traits: ["Diarizer"])
    ],
    targets: [
        .target(name: "Normalization"),
        .executableTarget(name: "Worker", dependencies: ["Normalization",
            .product(name: "FluidAudio", package: "FluidAudio")]),
        // CLT-only Swift 6.4 lacks XCTest and the TestingMacros plugin. Keep tests runnable without Xcode.
        .executableTarget(name: "alignment-tests", dependencies: ["Normalization"], path: "Tests/NormalizationTests")
    ]
)
