# Existing Whisper .NET app

The original solution is nested here so experiments can evolve independently. Application source, package versions, SDK pin and setup scripts are unchanged by the move.

## Run

From this directory, with .NET SDK 9.0.300 and FFmpeg installed:

```sh
dotnet build WhisperSpeechToTextDotnet.sln
dotnet run --project WhisperPrototype/WhisperPrototype.csproj
```

The existing Linux/WSL launcher is `WhisperPrototype/start`. Any external shortcuts pointing at its former location need updating; it has not been adapted for macOS.

Model downloads and CUDA setup scripts are alongside the solution. Existing documentation is in [the repository README](../../README.md), [docs](../../docs/) and [tasks](../../tasks/).

This app remains the transcription baseline. Experiments do not replace its file or live-transcription functionality.
