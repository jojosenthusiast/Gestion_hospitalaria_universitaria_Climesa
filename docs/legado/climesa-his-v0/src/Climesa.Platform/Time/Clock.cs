namespace Climesa.Platform.Time;

/// <summary>Single injectable clock (spec 000 FR-025). Instants are UTC.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public sealed class FakeClock(DateTimeOffset start) : IClock
{
    public DateTimeOffset UtcNow { get; private set; } = start;
    public void Advance(TimeSpan by) => UtcNow = UtcNow.Add(by);
    public void Set(DateTimeOffset at) => UtcNow = at;
}

public static class LocalTime
{
    private static readonly TimeZoneInfo Zone = ResolveZone();

    private static TimeZoneInfo ResolveZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/El_Salvador"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.CreateCustomTimeZone("America/El_Salvador", TimeSpan.FromHours(-6), "El Salvador", "CST"); }
    }

    public static DateTimeOffset ToLocal(DateTimeOffset utc) => TimeZoneInfo.ConvertTime(utc, Zone);

    public static DateOnly LocalDate(DateTimeOffset utc) => DateOnly.FromDateTime(ToLocal(utc).DateTime);

    public static string Format(DateTimeOffset? utc) => utc is null ? "" : ToLocal(utc.Value).ToString("dd/MM/yyyy HH:mm");
}
