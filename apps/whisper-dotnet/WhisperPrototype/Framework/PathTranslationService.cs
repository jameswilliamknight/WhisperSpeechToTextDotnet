using System.Text.RegularExpressions;

namespace WhisperPrototype.Framework;

public enum PathType
{
    Invalid,
    WindowsDriveLetter,
    UncNetworkPath,
    WslAbsolute,
    Relative
}

/// <summary>
/// Service for detecting and translating paths between Windows and WSL formats.
/// Ported from YouTube Channel Archiver.
/// </summary>
public class PathTranslationService
{
    // Regex pattern for Windows drive letter paths (e.g., C:\, Z:\path)
    private static readonly Regex WindowsPathPattern = new(@"^([A-Z]):\\", RegexOptions.IgnoreCase);
    
    // Regex pattern for UNC network paths (e.g., \\server\share)
    private static readonly Regex UncPathPattern = new(@"^\\\\[^\\]+\\[^\\]+");
    
    /// <summary>
    /// Detect the type of path
    /// </summary>
    public PathType DetectPathType(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return PathType.Invalid;
        
        // Check for Windows drive letter
        if (WindowsPathPattern.IsMatch(path))
            return PathType.WindowsDriveLetter;
        
        // Check for UNC path
        if (UncPathPattern.IsMatch(path))
            return PathType.UncNetworkPath;
        
        // Check for absolute WSL path
        if (path.StartsWith('/'))
            return PathType.WslAbsolute;
        
        // Relative path
        if (path.StartsWith("./") || path.StartsWith("../") || !path.Contains('/') && !path.Contains('\\'))
            return PathType.Relative;
        
        return PathType.Invalid;
    }
    
    /// <summary>
    /// Check if path is a Windows drive letter path
    /// </summary>
    public bool IsWindowsPath(string path)
    {
        return WindowsPathPattern.IsMatch(path);
    }
    
    /// <summary>
    /// Extract drive letter from Windows path (uppercase)
    /// </summary>
    /// <returns>Drive letter (e.g., "C", "Z") or null if not a Windows path</returns>
    public string? ExtractDriveLetter(string path)
    {
        var match = WindowsPathPattern.Match(path);
        return match.Success ? match.Groups[1].Value.ToUpper() : null;
    }
    
    /// <summary>
    /// Convert Windows path to WSL path (assumes drive is mounted at /mnt/{letter})
    /// </summary>
    /// <param name="windowsPath">Windows path (e.g., "Z:\videos\test")</param>
    /// <returns>WSL path (e.g., "/mnt/z/videos/test")</returns>
    public string ConvertToWslPath(string windowsPath)
    {
        var match = WindowsPathPattern.Match(windowsPath);
        if (!match.Success)
            throw new ArgumentException("Not a valid Windows drive letter path", nameof(windowsPath));
        
        var driveLetter = match.Groups[1].Value.ToLower();
        var pathPart = windowsPath.Substring(3); // Skip "C:\"
        
        // Replace backslashes with forward slashes
        pathPart = pathPart.Replace('\\', '/');
        
        return $"/mnt/{driveLetter}/{pathPart}".TrimEnd('/');
    }
    
    /// <summary>
    /// Convert WSL path to Windows path
    /// </summary>
    /// <param name="wslPath">WSL path (e.g., "/mnt/z/videos")</param>
    /// <returns>Windows path (e.g., "Z:\videos") or null if not a /mnt/ path</returns>
    public string? ConvertToWindowsPath(string wslPath)
    {
        if (!wslPath.StartsWith("/mnt/"))
            return null;
        
        var parts = wslPath.Substring(5).Split('/', 2); // Skip "/mnt/"
        if (parts.Length == 0 || parts[0].Length != 1)
            return null;
        
        var driveLetter = parts[0].ToUpper();
        var pathPart = parts.Length > 1 ? parts[1].Replace('/', '\\') : "";
        
        return $"{driveLetter}:\\{pathPart}".TrimEnd('\\');
    }
    
    /// <summary>
    /// Validate path format and characters
    /// </summary>
    public (bool isValid, string? errorMessage) ValidatePathFormat(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return (false, "Path cannot be empty");
        
        // Check for invalid characters (common across platforms)
        var invalidChars = new[] { '\0', '\n', '\r' };
        if (path.Any(c => invalidChars.Contains(c)))
            return (false, "Path contains invalid characters");
        
        // Detect path type
        var pathType = DetectPathType(path);
        
        switch (pathType)
        {
            case PathType.Invalid:
                return (false, "Unrecognized path format");
            
            case PathType.Relative:
                return (false, "Relative paths are not supported. Please use an absolute path.");
            
            case PathType.UncNetworkPath:
                return (false, "UNC paths (\\\\server\\share) are not directly supported. Please map to a drive letter first.");
            
            case PathType.WindowsDriveLetter:
            case PathType.WslAbsolute:
                return (true, null);
            
            default:
                return (false, "Unknown path type");
        }
    }
}