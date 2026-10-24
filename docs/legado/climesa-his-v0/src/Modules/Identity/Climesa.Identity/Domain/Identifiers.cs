using System.Text;
using Climesa.Platform.Errors;

namespace Climesa.Identity.Domain;

/// <summary>DUI: 8 digits plus check digit = (10 - (sum of digits weighted 9..2) mod 10) mod 10 (spec 001 FR-009).</summary>
public static class Dui
{
    public static string Normalize(string raw)
    {
        var digits = new string([.. raw.Where(char.IsDigit)]);
        if (digits.Length != 9)
        {
            throw new DomainError("dui_format", "El DUI debe tener 9 dígitos (8 más el verificador).");
        }
        if (!IsValidDigits(digits))
        {
            throw new DomainError("dui_check_digit", "El dígito verificador del DUI no coincide.");
        }
        return $"{digits[..8]}-{digits[8]}";
    }

    public static bool IsValid(string raw)
    {
        var digits = new string([.. raw.Where(char.IsDigit)]);
        return digits.Length == 9 && IsValidDigits(digits);
    }

    private static bool IsValidDigits(string digits)
    {
        var sum = 0;
        for (var i = 0; i < 8; i++)
        {
            sum += (digits[i] - '0') * (9 - i);
        }
        return (10 - (sum % 10)) % 10 == digits[8] - '0';
    }

    public static string Mask(string normalized) => normalized.Length < 4 ? "****" : new string('*', normalized.Length - 3) + normalized[^3..];
}

/// <summary>Facility MRN with ISO 7064 MOD 11-2 check character (spec 001 FR-006, FR-043).</summary>
public static class Mrn
{
    public static string Format(long sequence)
    {
        var body = sequence.ToString("D7", System.Globalization.CultureInfo.InvariantCulture);
        return $"{body}-{CheckChar(body)}";
    }

    public static char CheckChar(string digits)
    {
        var p = 0;
        foreach (var c in digits)
        {
            p = ((p + (c - '0')) * 2) % 11;
        }
        var check = (12 - p % 11) % 11;
        return check == 10 ? 'X' : (char)('0' + check);
    }

    public static bool IsValid(string mrn)
    {
        var parts = mrn.Trim().ToUpperInvariant().Split('-');
        return parts.Length == 2 && parts[0].Length > 0 && parts[0].All(char.IsDigit) && parts[1].Length == 1 && CheckChar(parts[0]) == parts[1][0];
    }
}

/// <summary>Normalization and Spanish phonetic keys, stored apart from the recorded name (spec 001 FR-003).</summary>
public static class NameKeys
{
    private static readonly HashSet<string> Particles = ["de", "del", "la", "las", "los", "y", "vda", "viuda"];

    public static string Normalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "";
        }
        var formD = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in formD)
        {
            var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (cat == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }
            sb.Append(char.IsLetterOrDigit(c) ? c : ' ');
        }
        return string.Join(' ', sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>Phonetic key of the significant tokens of a name part. Rules in spec 001 plan; calibrate before relying on them.</summary>
    public static string Phonetic(string? text)
    {
        var tokens = Normalize(text).Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(t => !Particles.Contains(t));
        return string.Join(' ', tokens.Select(PhoneticToken));
    }

    public static string FirstToken(string? text) => Phonetic(text).Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";

    private static string PhoneticToken(string t)
    {
        var s = t;
        if (s.StartsWith('x'))
        {
            s = "s" + s[1..];
        }
        s = s.Replace("ch", "\u0001")
             .Replace("qu", "k")
             .Replace("gue", "ge").Replace("gui", "gi")
             .Replace("ce", "se").Replace("ci", "si")
             .Replace("ll", "y")
             .Replace('v', 'b').Replace('z', 's').Replace('w', 'u');
        var sb = new StringBuilder();
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            if (c == 'h')
            {
                continue;
            }
            if (c == 'c')
            {
                c = 'k';
            }
            if (c == 'y' && (i == s.Length - 1))
            {
                c = 'i';
            }
            if (sb.Length > 0 && sb[^1] == c)
            {
                continue;
            }
            sb.Append(c);
        }
        return sb.ToString().Replace("\u0001", "ch");
    }
}

public enum BirthPrecision { Exact, YearMonth, Year, Estimated, Unknown }

/// <summary>Birth date with precision; an estimate is never shown or stored as exact (spec 001 FR-015).</summary>
public sealed record PartialBirth(DateOnly? Date, BirthPrecision Precision, int? EstimatedAge, DateOnly? EstimatedAt)
{
    public static PartialBirth Unknown => new(null, BirthPrecision.Unknown, null, null);

    public static PartialBirth FromEstimatedAge(int age, DateOnly at) => new(null, BirthPrecision.Estimated, age, at);

    public string Code => Precision switch
    {
        BirthPrecision.Exact => "exact",
        BirthPrecision.YearMonth => "year_month",
        BirthPrecision.Year => "year",
        BirthPrecision.Estimated => "estimated",
        _ => "unknown",
    };

    public int? Year => Precision switch
    {
        BirthPrecision.Exact or BirthPrecision.YearMonth or BirthPrecision.Year => Date?.Year,
        BirthPrecision.Estimated when EstimatedAge is not null && EstimatedAt is not null => EstimatedAt.Value.Year - EstimatedAge,
        _ => null,
    };

    public string Display => Precision switch
    {
        BirthPrecision.Exact => Date!.Value.ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture),
        BirthPrecision.YearMonth => Date!.Value.ToString("MM/yyyy", System.Globalization.CultureInfo.InvariantCulture),
        BirthPrecision.Year => Date!.Value.Year.ToString(System.Globalization.CultureInfo.InvariantCulture),
        BirthPrecision.Estimated => $"~{EstimatedAge} años (estimado el {EstimatedAt:dd/MM/yyyy})",
        _ => "Desconocida",
    };

    public static PartialBirth FromDb(DateOnly? date, string precision, int? age, DateOnly? at) => precision switch
    {
        "exact" => new(date, BirthPrecision.Exact, null, null),
        "year_month" => new(date, BirthPrecision.YearMonth, null, null),
        "year" => new(date, BirthPrecision.Year, null, null),
        "estimated" => new(null, BirthPrecision.Estimated, age, at),
        _ => Unknown,
    };
}
