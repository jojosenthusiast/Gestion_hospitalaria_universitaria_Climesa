using Climesa.Identity.Application;
using Climesa.Identity.Contracts;
using Climesa.Platform.Errors;
using Npgsql;

namespace Climesa.Tests;

public static class IdentityTests
{
    private static NewPerson Person(string given, string first, string? second = null, string? dui = null, DateOnly? birth = null) =>
        new(given, first, second, null, birth ?? new DateOnly(1980, 5, 17), "exact", null, "female", dui, null, null, null, "Santa Ana Centro", null, null, "la paciente");

    private static async Task<PersonSummary> Register(TestHost h, NewPerson p, string user = "admision-test")
    {
        var actor = TestHost.Everything(user);
        var search = await h.Identity.Search(actor, new SearchCriteria($"{p.GivenNames} {p.FirstSurname}", p.Dui, null, null));
        return await h.Identity.Register(actor, search.Token, p, Guid.NewGuid().ToString("N"));
    }

    [Test("001 FR-001")]
    public static async Task RegistrationRequiresSearch()
    {
        var h = new TestHost();
        await Assert.Fails(() => h.Identity.Register(TestHost.Everything(), Guid.NewGuid(), Person("Sin", "Busqueda"), null), "search_required", "token inexistente");
        var other = TestHost.Everything("otro-usuario");
        var search = await h.Identity.Search(other, new SearchCriteria("Sin Busqueda", null, null, null));
        await Assert.Fails(() => h.Identity.Register(TestHost.Everything("admision-test"), search.Token, Person("Sin", "Busqueda"), null), "search_required", "token de otro usuario");
        h.Clock.Advance(TimeSpan.FromMinutes(31));
        await Assert.Fails(() => h.Identity.Register(other, search.Token, Person("Sin", "Busqueda"), null), "search_required", "token vencido");
    }

    [Test("001 FR-002, FR-003")]
    public static async Task SearchExplainsWhyCandidatesMatch()
    {
        var h = new TestHost();
        var created = await Register(h, Person("Ana Belén", "Hernández", "Vásquez", "02468135-7"));
        var byPhonetic = await h.Identity.Search(TestHost.Everything(), new SearchCriteria("hernandes basquez ana", null, null, null));
        var hit = byPhonetic.Candidates.Single(c => c.PersonId == created.PersonId);
        Assert.True(hit.Reasons.Contains("nombres fonéticamente similares"), "motivo fonético: " + string.Join(",", hit.Reasons));
        var byDui = await h.Identity.Search(TestHost.Everything(), new SearchCriteria(null, "024681357", null, null));
        Assert.True(byDui.Candidates.Single().Reasons.Contains("mismo DUI"), "motivo DUI");
        Assert.Equal("*******5-7", byDui.Candidates.Single().MaskedDui, "DUI enmascarado en resultados");
        var byMrn = await h.Identity.Search(TestHost.Everything(), new SearchCriteria(null, null, created.Mrn, null));
        Assert.Equal(created.PersonId, byMrn.Candidates.Single().PersonId, "por expediente");
    }

    [Test("001 FR-010")]
    public static async Task ConcurrentRegistrationOfSameDuiYieldsOneIdentity()
    {
        var h = new TestHost();
        var a = TestHost.Everything("ventanilla-a");
        var b = TestHost.Everything("ventanilla-b");
        var sa = await h.Identity.Search(a, new SearchCriteria("Gemela Uno", null, null, null));
        var sb = await h.Identity.Search(b, new SearchCriteria("Gemela Dos", null, null, null));
        var results = await Task.WhenAll(
            Capture(() => h.Identity.Register(a, sa.Token, Person("Lucía", "Concurrente", dui: "01234567-8"), null)),
            Capture(() => h.Identity.Register(b, sb.Token, Person("Lucía", "Concurrente", dui: "01234567-8"), null)));
        Assert.Equal(1, results.Count(r => r is null), "exactamente un registro exitoso");
        Assert.Equal("identifier_conflict", results.Single(r => r is not null)!.Code, "el otro recibe conflicto explícito");
    }

    private static async Task<DomainError?> Capture(Func<Task> action)
    {
        try
        {
            await action();
            return null;
        }
        catch (DomainError e)
        {
            return e;
        }
    }

    [Test("001 FR-014, FR-016")]
    public static async Task ProvisionalIdentityHasNoInventedData()
    {
        var h = new TestHost();
        var p = await h.Identity.RegisterProvisional(TestHost.Everything(), new ProvisionalRegistration("hombre adulto inconsciente", null, null, null), null);
        Assert.Equal("provisional", p.Status, "estado");
        Assert.True(p.ProvisionalAlias!.StartsWith("NN-2026-", StringComparison.Ordinal), "alias generado");
        Assert.Equal("Desconocida", p.BirthDisplay, "sin fecha inventada");
        Assert.Equal("Desconocido", p.Sex, "sexo desconocido");
    }

    [Test("001 FR-021, FR-040")]
    public static async Task TwinsGetOwnIdentitiesLinkedToMother()
    {
        var h = new TestHost();
        var mother = await Register(h, Person("María Elena", "López", "Pérez"));
        var twins = await h.Identity.RegisterNewborns(TestHost.Everything(), mother.PersonId, ["female", "male"], null);
        Assert.Equal(2, twins.Count, "dos identidades");
        Assert.True(twins[0].Mrn != twins[1].Mrn && twins[0].Mrn != mother.Mrn, "expedientes distintos");
        Assert.True(twins[0].DisplayName.Contains("niña A", StringComparison.Ordinal) && twins[1].DisplayName.Contains("niño B", StringComparison.Ordinal),
            $"nombres temporales: {twins[0].DisplayName} / {twins[1].DisplayName}");
        var detail = await h.Identity.GetDetail(TestHost.Everything(), twins[1].PersonId);
        Assert.True(detail.Relationships.Any(r => r.Type == "mother" && r.BirthOrder == 2 && r.RelatedPersonId == mother.PersonId), "vínculo con la madre y orden de nacimiento");
    }

    [Test("001 FR-023, FR-025")]
    public static async Task HistoryIsAppendOnlyAndStaleUpdatesFail()
    {
        var h = new TestHost();
        var p = await Register(h, Person("Rosa", "Historial"));
        var actor = TestHost.Everything();
        var v2 = await h.Identity.UpdateContact(actor, p.PersonId, 1, "Chalchuapa", "Barrio El Centro", "7777-0000", "cambio de domicilio");
        Assert.Equal(2, v2, "nueva versión");
        await Assert.Fails(() => h.Identity.UpdateContact(actor, p.PersonId, 1, "Metapán", null, null, "otro cambio"), "version_conflict", "versión vieja");
        var detail = await h.Identity.GetDetail(actor, p.PersonId);
        Assert.True(detail.History.Count == 2 && detail.History[0].Diff.Contains("Chalchuapa", StringComparison.Ordinal), "historial con diferencia");
        var ex = await Assert.Throws<PostgresException>(() => h.Db.InTx(tx => tx.Exec("update identity.person_versions set reason='borrado'")), "reescribir historial");
        Assert.Equal("42501", ex.SqlState, "la base de datos lo impide");
    }

    [Test("001 FR-027")]
    public static async Task SimilarRegistrationOpensCaseAndNeverMerges()
    {
        var h = new TestHost();
        var first = await Register(h, Person("José Ángel", "Velásquez", birth: new DateOnly(1971, 3, 3)));
        var second = await Register(h, Person("Jose Angel", "Belasques", birth: new DateOnly(1971, 8, 9)), "otro-admisionista");
        var cases = await h.Identity.OpenCases(TestHost.Everything());
        Assert.True(cases.Any(c => c.PersonIds.Contains(first.PersonId) && c.PersonIds.Contains(second.PersonId)), "caso de posible duplicado abierto");
        Assert.Equal("active", (await h.Identity.GetSummary(first.PersonId))!.Status, "primera identidad intacta");
        Assert.Equal("active", (await h.Identity.GetSummary(second.PersonId))!.Status, "segunda identidad intacta");
    }

    [Test("001 FR-038")]
    public static async Task SearchAuditStoresHashNotNames()
    {
        var h = new TestHost();
        await h.Identity.Search(TestHost.Everything("auditado"), new SearchCriteria("Nombre Muy Privado", null, null, null));
        var detail = await h.Db.InTx(tx => tx.Scalar<string>("select detail::text from platform.audit_events where actor_username='auditado' and action='search' order by seq desc limit 1"));
        Assert.True(detail is not null && detail.Contains("criteriaHash", StringComparison.Ordinal) && !detail.Contains("Privado", StringComparison.Ordinal), "sin el texto buscado: " + detail);
    }
}
