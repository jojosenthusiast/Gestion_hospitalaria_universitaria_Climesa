using System.Text;

namespace Climesa.Tests;

public static class MigrationTests
{
    private const string Header = "numero_expediente,nombres,primer_apellido,segundo_apellido,apellido_casada,nombre_completo,fecha_nacimiento,precision,sexo,dui,municipio,direccion\n";

    [Test("004 FR-003, FR-004, FR-007")]
    public static async Task BatchBalancesAndKeepsCharacters()
    {
        var h = new TestHost();
        var csv = Header +
            "T-1,Begoña,Ñúñez,Ibáñez,,,1950-01-01,exact,F,,Santa Ana,\n" +
            "T-2,,,,,PEDRO PABLO ARIAS DUARTE,1960,year,M,,,\n" +
            "T-3,Luis,Mejía,,,,1970,year,M,12345678-9,,\n" +
            ",Sin,Numero,,,,,,,,,\n" +
            "T-5,Raúl,O'Connor,Melara,,,1982-02-28,exact,M,,,\n";
        var actor = TestHost.Everything("archivo-test");
        var result = await h.Migration.LoadArchiveIndex(actor, "prueba.csv", Encoding.UTF8.GetBytes(csv));
        Assert.Equal("completed", result.Status, "lote conciliado");
        Assert.Equal(5, result.Read, "leídas");
        Assert.Equal(result.Read, result.Created + result.Matched + result.Rejected + result.Pending, "leídas = creadas + encontradas + rechazadas + pendientes");
        Assert.Equal(2, result.Created, "creadas");
        Assert.Equal(1, result.Pending, "nombre completo queda pendiente de separación");
        Assert.Equal(2, result.Rejected, "DUI inválido y fila sin número");
        Assert.True(result.CharacterSample!.Contains("Ñúñez Ibáñez", StringComparison.Ordinal) && !result.CharacterSample.Contains("\"identical\":false", StringComparison.Ordinal), "caracteres intactos: " + result.CharacterSample);
        var stored = await h.Identity.Search(actor, new Climesa.Identity.Application.SearchCriteria("Raúl O'Connor", null, null, null));
        Assert.True(stored.Candidates.Any(c => c.DisplayName.Contains("O'Connor", StringComparison.Ordinal)), "apóstrofo conservado");
    }

    [Test("004 FR-006")]
    public static async Task SameFileTwiceHasNoNewEffects()
    {
        var h = new TestHost();
        var csv = Encoding.UTF8.GetBytes(Header + "R-1,Marta,Repetida,,,,1990,year,F,,,\n");
        var actor = TestHost.Everything("archivo-repite");
        var first = await h.Migration.LoadArchiveIndex(actor, "a.csv", csv);
        var count = await h.Db.InTx(tx => tx.Scalar<long>("select count(*) from identity.identifiers where type_code='legacy_paper_mrn' and value_normalized='R-1'"));
        var second = await h.Migration.LoadArchiveIndex(actor, "a-otra-vez.csv", csv);
        Assert.True(second.AlreadyApplied && second.Id == first.Id, "mismo lote");
        Assert.Equal(count, await h.Db.InTx(tx => tx.Scalar<long>("select count(*) from identity.identifiers where type_code='legacy_paper_mrn' and value_normalized='R-1'")), "sin identidades nuevas");
    }

    [Test("004 FR-008, FR-009")]
    public static async Task LegacyNumberOnTwoPeopleGoesToConflictQueue()
    {
        var h = new TestHost();
        var actor = TestHost.Everything("archivo-conflicto");
        await h.Migration.LoadArchiveIndex(actor, "1.csv", Encoding.UTF8.GetBytes(Header + "C-9,Elsa,Primera,,,,1950,year,F,,,\n"));
        var second = await h.Migration.LoadArchiveIndex(actor, "2.csv", Encoding.UTF8.GetBytes(Header + "C-9,Tomás,Distinto,,,,1980,year,M,,,\nC-10,Elsa,Primera,,,,1950,year,F,,,\n"));
        var items = await h.Migration.Items(actor, second.Id);
        Assert.Equal("legacy_identifier_conflict", items.Single(i => i.LegacyNumber == "C-9").Rule, "mismo número en papel con otro nombre");
        Assert.Equal("possible_duplicate", items.Single(i => i.LegacyNumber == "C-10").Rule, "mismo nombre con otro número abre caso");
    }

    [Test("004 FR-007")]
    public static async Task NonUtf8FileIsRefused()
    {
        var h = new TestHost();
        var latin1 = Encoding.Latin1.GetBytes(Header + "L-1,Niño,Peña,,,,1990,year,M,,,\n");
        await Assert.Fails(() => h.Migration.LoadArchiveIndex(TestHost.Everything("archivo-latin1"), "latin1.csv", latin1), "encoding", "archivo no UTF-8");
    }
}
