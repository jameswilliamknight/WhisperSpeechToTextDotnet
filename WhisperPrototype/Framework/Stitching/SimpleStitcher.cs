namespace WhisperPrototype.Framework.Stitching;

/// <summary>
/// Simple baseline stitching algorithm that finds longest matching overlap.
/// No boundary discarding, no weighting - useful for comparison with advanced algorithms.
/// </summary>
public class SimpleStitcher : ITranscriptionStitcher
{
    private readonly int _minimumWordMatch;
    
    public string AlgorithmName => "Simple Overlap Detection";
    
    public SimpleStitcher(int minimumWordMatch = 2)
    {
        _minimumWordMatch = minimumWordMatch;
    }
    
    public string StitchSegments(string previousSegment, string newSegment)
    {
        if (string.IsNullOrWhiteSpace(previousSegment))
            return newSegment;
            
        if (string.IsNullOrWhiteSpace(newSegment))
            return string.Empty;
        
        // Split into words
        var previousWords = SplitIntoWords(previousSegment);
        var newWords = SplitIntoWords(newSegment);
        
        if (previousWords.Length == 0)
            return newSegment;
        if (newWords.Length == 0)
            return string.Empty;
        
        // Find longest matching suffix/prefix overlap
        int bestOverlap = FindLongestOverlap(previousWords, newWords);
        
        // Return only the unique portion of new text
        if (bestOverlap > 0 && bestOverlap < newWords.Length)
        {
            var uniqueWords = newWords.Skip(bestOverlap).ToArray();
            return string.Join(" ", uniqueWords);
        }
        
        // No overlap found, return entire new segment
        return newSegment;
    }
    
    private string[] SplitIntoWords(string text)
    {
        return text.Split(new[] { ' ', '\t', '\n', '\r' }, 
            StringSplitOptions.RemoveEmptyEntries);
    }
    
    private int FindLongestOverlap(string[] previousWords, string[] newWords)
    {
        int longestOverlap = 0;
        int maxOverlapLength = Math.Min(previousWords.Length, newWords.Length);
        
        // Try different overlap lengths (from minimum to maximum possible)
        // Start from longest to find the best match first
        for (int overlapLength = maxOverlapLength; overlapLength >= _minimumWordMatch; overlapLength--)
        {
            // Check if the end of previous matches the start of new
            bool matches = true;
            int startPosInPrevious = previousWords.Length - overlapLength;
            
            for (int i = 0; i < overlapLength; i++)
            {
                if (!string.Equals(
                    previousWords[startPosInPrevious + i], 
                    newWords[i], 
                    StringComparison.OrdinalIgnoreCase))
                {
                    matches = false;
                    break;
                }
            }
            
            if (matches)
            {
                longestOverlap = overlapLength;
                break; // Found the longest, no need to continue
            }
        }
        
        return longestOverlap;
    }
}

