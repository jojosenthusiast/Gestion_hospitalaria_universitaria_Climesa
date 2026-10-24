using Climesa.Identity.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Pacientes;

public class NuevoModel(ActorAccessor actors, IdentityService identity) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid Token { get; set; }
    [BindProperty] public string Key { get; set; } = NewKey();
    [BindProperty] public string? GivenNames { get; set; }
    [BindProperty] public string? FirstSurname { get; set; }
    [BindProperty] public string? SecondSurname { get; set; }
    [BindProperty] public string? MarriedSurname { get; set; }
    [BindProperty] public DateOnly? BirthDate { get; set; }
    [BindProperty] public string BirthPrecision { get; set; } = "exact";
    [BindProperty] public int? EstimatedAge { get; set; }
    [BindProperty] public string Sex { get; set; } = "female";
    [BindProperty] public string? Dui { get; set; }
    [BindProperty] public string? OtherType { get; set; }
    [BindProperty] public string? OtherValue { get; set; }
    [BindProperty] public string? OtherIssuer { get; set; }
    [BindProperty] public string? Municipality { get; set; }
    [BindProperty] public string? AddressText { get; set; }
    [BindProperty] public string? Phone { get; set; }
    [BindProperty] public string? Informant { get; set; }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync()
    {
        Climesa.Identity.Contracts.PersonSummary? created = null;
        var ok = await Try(async () => created = await identity.Register(Actor, Token, new NewPerson(
            GivenNames ?? "", FirstSurname ?? "", SecondSurname, MarriedSurname, BirthDate, BirthPrecision, EstimatedAge, Sex, Dui,
            OtherType, OtherValue, OtherIssuer, Municipality, AddressText, Phone, Informant), Key));
        if (!ok)
        {
            return Page();
        }
        Flash = $"Paciente registrado con expediente {created!.Mrn}.";
        return Redirect($"/Pacientes/Detalle/{created.PersonId}");
    }
}
