using System.Text;

namespace WhisperPrototype.Framework.Stitching;

/// <summary>
/// Novel stitching algorithm that accounts for boundary word unreliability.
/// Discards words near segment boundaries and weights matches by distance from edges.
/// </summary>
public class BoundaryWeightedStitcher : ITranscriptionStitcher
{
    private readonly int _minimumWordMatch;
    private readonly int _discardPreviousWords;
    private readonly bool _useWeighting;
    private readonly bool _useFuzzyMatching;
    private readonly double _fuzzyThreshold;
    
    public string AlgorithmName => _useFuzzyMatching 
        ? "Boundary-Weighted Stitching with Fuzzy Matching" 
        : "Boundary-Weighted Stitching";
    
    public BoundaryWeightedStitcher(
        int minimumWordMatch = 2, 
        int discardPreviousWords = 4,
        bool useWeighting = true,
        bool useFuzzyMatching = true,
        double fuzzyThreshold = 0.80)
    {
        _minimumWordMatch = minimumWordMatch;
        _discardPreviousWords = discardPreviousWords;
        _useWeighting = useWeighting;
        _useFuzzyMatching = useFuzzyMatching;
        _fuzzyThreshold = fuzzyThreshold;
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
        
        // Discard unreliable words from end of previous segment
        var effectivePreviousWords = DiscardEndWords(previousWords, _discardPreviousWords);
        
        if (effectivePreviousWords.Length == 0)
        {
            // If we discarded everything, just return the new segment
            return newSegment;
        }
        
        // Find best overlap with weighted scoring
        var bestOverlap = FindBestWeightedOverlap(effectivePreviousWords, newWords);
        
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
    
    private string NormalizeWord(string word)
    {
        // Remove punctuation and convert to lowercase for comparison
        // Keep hyphens internal to words (e.g., "real-time" stays as is)
        var normalized = new string(word
            .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '\'')
            .ToArray())
            .ToLowerInvariant();
        
        // Remove leading/trailing hyphens that might remain
        return normalized.Trim('-');
    }
    
    private string[] DiscardEndWords(string[] words, int discardCount)
    {
        if (discardCount <= 0 || discardCount >= words.Length)
            return words.Length > discardCount ? words : Array.Empty<string>();
            
        return words.Take(words.Length - discardCount).ToArray();
    }
    
    private int FindBestWeightedOverlap(string[] previousWords, string[] newWords)
    {
        int bestOverlap = 0;
        double bestScore = 0;
        
        // Try different overlap lengths (from minimum to maximum possible)
        int maxOverlapLength = Math.Min(previousWords.Length, newWords.Length);
        
        for (int overlapLength = _minimumWordMatch; overlapLength <= maxOverlapLength; overlapLength++)
        {
            // Check if the end of previous matches the start of new
            bool matches = true;
            int startPosInPrevious = previousWords.Length - overlapLength;
            
            for (int i = 0; i < overlapLength; i++)
            {
                // Normalize both words to handle punctuation and capitalization differences
                var prevWordNormalized = NormalizeWord(previousWords[startPosInPrevious + i]);
                var newWordNormalized = NormalizeWord(newWords[i]);
                
                bool wordsMatch;
                
                if (_useFuzzyMatching)
                {
                    // Use fuzzy matching to handle transcription inconsistencies
                    // e.g., "detection" vs "detective", "trimming" vs "running"
                    wordsMatch = FuzzyMatcher.AreSimilar(prevWordNormalized, newWordNormalized, _fuzzyThreshold);
                }
                else
                {
                    // Exact match only
                    wordsMatch = string.Equals(prevWordNormalized, newWordNormalized, StringComparison.Ordinal);
                }
                
                if (!wordsMatch)
                {
                    matches = false;
                    break;
                }
            }
            
            if (matches)
            {
                // Calculate score based on overlap length and distance from boundary
                int distanceFromBoundary = startPosInPrevious;
                double score = CalculateMatchScore(overlapLength, distanceFromBoundary);
                
                if (score > bestScore)
                {
                    bestScore = score;
                    bestOverlap = overlapLength;
                }
            }
        }
        
        return bestOverlap;
    }
    
    private double CalculateMatchScore(int overlapLength, int distanceFromBoundary)
    {
        if (!_useWeighting)
            return overlapLength;
        
        // Words further from boundary = higher confidence
        // Formula: score = overlap_length * (1 + distance_weight_factor)
        // Distance weight gives bonus for matches further from the boundary
        double distanceWeight = Math.Min(distanceFromBoundary / 10.0, 1.0); // Normalize, cap at 100%
        return overlapLength * (1.0 + distanceWeight);
    }
}

