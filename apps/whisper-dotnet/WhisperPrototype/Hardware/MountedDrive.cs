namespace WhisperPrototype.Hardware;

/// <summary>
/// Represents a mounted drive in the Linux/WSL environment
/// </summary>
public class MountedDrive
{
    /// <summary>
    /// The Windows drive letter (e.g., "C", "D", "J")
    /// </summary>
    public required string DriveLetter { get; set; }
    
    /// <summary>
    /// The mount point path (e.g., "/mnt/c", "/mnt/j")
    /// </summary>
    public required string MountPoint { get; set; }
    
    /// <summary>
    /// The file system type (e.g., "drvfs", "9p")
    /// </summary>
    public string? FileSystemType { get; set; }
    
    /// <summary>
    /// Whether this drive was mounted during the current session
    /// </summary>
    public bool IsSessionMount { get; set; }
}

/// <summary>
/// Status of a Windows drive mount
/// </summary>
public enum MountStatus
{
    Mounted,
    NotMounted,
    UnknownDrive
}

public class MountResult
{
    public bool Success { get; set; }
    public string? MountPoint { get; set; }
    public string? ErrorMessage { get; set; }
}