using System.Collections.Concurrent;

namespace WhisperPrototype.Framework;

/// <summary>
/// Circular buffer for managing overlapping audio windows.
/// Maintains a fixed-size buffer of audio data for efficient windowed processing.
/// </summary>
public class CircularAudioBuffer
{
    private readonly byte[] _buffer;
    private readonly int _capacity;
    private int _writePosition;
    private int _totalBytesWritten;
    private readonly object _lock = new object();

    public CircularAudioBuffer(int capacityInBytes)
    {
        _capacity = capacityInBytes;
        _buffer = new byte[capacityInBytes];
        _writePosition = 0;
        _totalBytesWritten = 0;
    }

    /// <summary>
    /// Gets the current number of bytes available in the buffer (up to capacity).
    /// </summary>
    public int AvailableBytes
    {
        get
        {
            lock (_lock)
            {
                return Math.Min(_totalBytesWritten, _capacity);
            }
        }
    }

    /// <summary>
    /// Gets the total number of bytes written to the buffer (may exceed capacity).
    /// </summary>
    public int TotalBytesWritten
    {
        get
        {
            lock (_lock)
            {
                return _totalBytesWritten;
            }
        }
    }

    /// <summary>
    /// Writes data to the circular buffer.
    /// </summary>
    public void Write(byte[] data, int offset, int count)
    {
        lock (_lock)
        {
            for (int i = 0; i < count; i++)
            {
                _buffer[_writePosition] = data[offset + i];
                _writePosition = (_writePosition + 1) % _capacity;
                _totalBytesWritten++;
            }
        }
    }

    /// <summary>
    /// Reads the entire buffer contents into a new byte array.
    /// Returns data in chronological order (oldest to newest).
    /// </summary>
    public byte[] ReadAll()
    {
        lock (_lock)
        {
            int bytesToRead = Math.Min(_totalBytesWritten, _capacity);
            byte[] result = new byte[bytesToRead];

            if (_totalBytesWritten < _capacity)
            {
                // Buffer not yet full, data is from start to writePosition
                Array.Copy(_buffer, 0, result, 0, bytesToRead);
            }
            else
            {
                // Buffer is full, need to read in two parts to maintain chronological order
                int firstPartLength = _capacity - _writePosition;
                int secondPartLength = _writePosition;

                // Copy from writePosition to end (oldest data)
                Array.Copy(_buffer, _writePosition, result, 0, firstPartLength);
                // Copy from start to writePosition (newest data)
                Array.Copy(_buffer, 0, result, firstPartLength, secondPartLength);
            }

            return result;
        }
    }

    /// <summary>
    /// Clears the buffer and resets counters.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            Array.Clear(_buffer, 0, _capacity);
            _writePosition = 0;
            _totalBytesWritten = 0;
        }
    }
}

