namespace WhisperPrototype.Framework.Stitching;

/// <summary>
/// Factory for creating transcription stitcher instances based on configuration.
/// Allows easy experimentation with different stitching algorithms.
/// </summary>
public static class StitcherFactory
{
    /// <summary>
    /// Creates a stitcher instance based on application settings
    /// </summary>
    /// <param name="settings">Application settings containing stitcher configuration</param>
    /// <returns>Configured stitcher instance</returns>
    public static ITranscriptionStitcher CreateStitcher(AppSettings settings)
    {
        return settings.LiveStitchingAlgorithm switch
        {
            "BoundaryWeighted" => new BoundaryWeightedStitcher(
                settings.StitchMinimumWordMatch,
                settings.StitchDiscardPreviousWords,
                settings.StitchUseWeighting,
                settings.StitchUseFuzzyMatching,
                settings.StitchFuzzyThreshold),
            
            "Simple" => new SimpleStitcher(settings.StitchMinimumWordMatch),
            
            _ => new BoundaryWeightedStitcher(
                settings.StitchMinimumWordMatch,
                settings.StitchDiscardPreviousWords,
                settings.StitchUseWeighting,
                settings.StitchUseFuzzyMatching,
                settings.StitchFuzzyThreshold) // Default to boundary-weighted
        };
    }
}

