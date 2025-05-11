< [Back](../README.md)  ⚡  [Live Transcription](../../../wwjd/docs/live_transcription/Details.md)

# Troubleshooting WSL Audio for Live Transcription (PulseAudio)

If you encounter issues with microphone input when using the live transcription feature within WSL, particularly if the `WslPulseAudioCaptureService` is active, these steps can help diagnose the problem.

This service relies on `pactl` for listing devices and `parec` for audio capture via PulseAudio.

WSL's PulseAudio setup often mirrors or defaults to the Windows sound settings.

Ensure the microphone you intend to use is set as the **default recording device** in your Windows sound control panel.


## Identify PulseAudio Source Name

First, list your PulseAudio sources from the WSL terminal to find your microphone's name. PulseAudio sources are how WSL sees your audio inputs.

```bash
pactl list sources short
```

Look for a source that represents your microphone. Keyword you're looking for is `source`.

I believe this is some kind of proxy to the default device in the Windows host.


## Test Recording with `parec`

Use the source name you identified in the previous step (replace `YourMicSourceName` below) to attempt a raw audio recording. Speak into your microphone for a few seconds, then press `Ctrl+C` to stop the recording.

```bash
parec --device=YourMicSourceName --format=s16le --rate=16000 --channels=1 --raw > test_audio.raw
```

For example, if your device name was `RDPSource`:

```bash
parec --device=RDPSource --format=s16le --rate=16000 --channels=1 --raw > test_audio.raw
```

This command attempts to record audio in the format expected by Whisper.net (16kHz, 16-bit Little Endian, mono).


## Test Playback with `paplay`

Attempt to play back the `test_audio.raw` file you just created:

```bash
paplay --raw --format=s16le --rate=16000 --channels=1 test_audio.raw
```

## Restart PulseAudio in WSL (if necessary)

```bash
pulseaudio -k
pulseaudio --start
```

Retry the `pactl list sources short` and `parec` tests after restarting.

## WSL Configuration for Audio

Ensure your WSL instance is configured for audio pass-through. For WSL2, this usually involves settings in your `.wslconfig` file on Windows (e.g., ensuring `localhostForwarding=true` if PulseAudio is running as a server on Windows that WSL connects to, though newer WSL versions have more integrated audio). Check the official Microsoft WSL documentation for audio troubleshooting.
