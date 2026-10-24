using Climesa.Identity.Domain;
using Climesa.Migration.Application;
using Climesa.Platform.Errors;
using Climesa.Platform.Time;

namespace Climesa.Tests;

public static class DomainTests
{
    [Test("001 FR-009")]
    public static async Task DuiCheckDigit()
    {
        Assert.True(Dui.IsValid("00016297-5"), "00016297-5 debe ser válido");
        Assert.True(!Dui.IsValid("00016297-4"), "00016297-4 debe ser inválido");
        Assert.Equal("00016297-5", Dui.Normalize("000162975"), "normalización sin guion");
        Assert.Equal("04567812-3", Dui.Normalize(" 04567812 3 "), "normalización con espacios");
        await Assert.Fails(() => { Dui.Normalize("1234"); return Task.CompletedTask; }, "dui_format", "longitud incorrecta");
        await Assert.Fails(() => { Dui.Normalize("00016297-4"); return Task.CompletedTask; }, "dui_check_digit", "dígito incorrecto");
        Assert.Equal("*******7-5", Dui.Mask("00016297-5"), "enmascarado");
    }

    [Test("001 FR-043")]
    public static void MrnCheckCharacter()
    {
        for (var i = 1; i < 2000; i++)
        {
            var mrn = Mrn.Format(i);
            Assert.True(Mrn.IsValid(mrn), $"{mrn} generado debe validar");
            var body = mrn[..7];
            var wrongDigit = (char)('0' + ((body[6] - '0' + 1) % 10));
            Assert.True(!Mrn.IsValid(body[..6] + wrongDigit + mrn[7..]), $"un dígito alterado en {mrn} debe invalidar");
        }
        Assert.True(!Mrn.IsValid("0000001"), "sin verificador es inválido");
    }

    [Test("001 FR-003")]
    public static void SpanishPhoneticKeys()
    {
        (string, string)[] same =
        [
            ("Hernández", "Hernandes"), ("Vásquez", "Basquez"), ("Velásquez", "Belasques"), ("Gutiérrez", "Gutierres"),
            ("Llanes", "Yanes"), ("Zelaya", "Selaya"), ("Cerna", "Serna"), ("Quintanilla", "Kintaniya"), ("Hugo", "Ugo"),
            ("Elías", "Elias"), ("Peña", "Pena"), ("Xiomara", "Siomara"), ("Guillermo", "Gillermo"), ("Rivas", "Ribas"),
            ("de León", "Leon"), ("Martínez", "Martines"), ("Orellana", "Oreyana"), ("Chávez", "Chabes"),
        ];
        foreach (var (a, b) in same)
        {
            Assert.Equal(NameKeys.Phonetic(a), NameKeys.Phonetic(b), $"'{a}' y '{b}' deben sonar igual");
        }
        (string, string)[] different = [("Pérez", "Peña"), ("López", "Lobos"), ("Ana", "Anabel"), ("Castro", "Castillo"), ("Mejía", "Molina"), ("Ramos", "Romero")];
        foreach (var (a, b) in different)
        {
            Assert.True(NameKeys.Phonetic(a) != NameKeys.Phonetic(b), $"'{a}' y '{b}' deben distinguirse");
        }
        Assert.Equal("maria elena munoz pena", NameKeys.Normalize("  MARÍA   Elena Muñoz-Peña "), "normalización");
    }

    [Test("001 FR-015")]
    public static void EstimatedBirthIsNeverExact()
    {
        var est = PartialBirth.FromEstimatedAge(70, new DateOnly(2026, 10, 13));
        Assert.True(est.Date is null, "una estimación no guarda fecha");
        Assert.True(est.Display.StartsWith('~'), "se muestra como aproximada");
        Assert.Equal(1956, est.Year, "año derivado");
        Assert.Equal("Desconocida", PartialBirth.Unknown.Display, "desconocida");
    }

    [Test("000 FR-025")]
    public static void LocalDateInElSalvador()
    {
        Assert.Equal(new DateOnly(2026, 10, 12), LocalTime.LocalDate(new DateTimeOffset(2026, 10, 13, 5, 30, 0, TimeSpan.Zero)), "05:30Z es 23:30 del día anterior");
        Assert.Equal(new DateOnly(2026, 10, 13), LocalTime.LocalDate(new DateTimeOffset(2026, 10, 13, 6, 0, 0, TimeSpan.Zero)), "06:00Z es medianoche local");
    }

    [Test("004 FR-011")]
    public static void CsvAndNameSplitSuggestion()
    {
        var rows = Csv.Parse("a,b,c\r\n\"Col. El Palmar, pasaje 3\",\"O\"\"Connor\",x\n");
        Assert.Equal(2, rows.Count, "filas");
        Assert.Equal("Col. El Palmar, pasaje 3", rows[1][0], "coma dentro de comillas");
        Assert.Equal("O\"Connor", rows[1][1], "comilla escapada");
        Assert.True(MigrationService.SuggestSplit("ROSA AMINTA GUEVARA DE MOLINA").Contains("nombres='ROSA AMINTA'", StringComparison.Ordinal), "con apellido de casada y tres palabras: dos nombres");
        Assert.True(MigrationService.SuggestSplit("JUAN CARLOS PEREZ LOPEZ").Contains("primer_apellido='PEREZ', segundo_apellido='LOPEZ'", StringComparison.Ordinal), "cuatro palabras");
    }
}
