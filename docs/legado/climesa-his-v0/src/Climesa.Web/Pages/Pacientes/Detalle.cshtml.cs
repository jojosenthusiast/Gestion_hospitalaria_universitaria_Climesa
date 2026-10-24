using Climesa.Identity.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Pacientes;

public class DetalleModel(ActorAccessor actors, IdentityService identity) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid Id { get; set; }
    public PersonDetail? Detail { get; private set; }

    public async Task OnGetAsync() => await Load();

    public async Task<IActionResult> OnPostContactAsync(int expectedVersion, string? municipality, string? addressText, string? phone, string? reason)
    {
        if (await Try(() => identity.UpdateContact(Actor, Id, expectedVersion, municipality, addressText, phone, reason ?? "")))
        {
            Flash = "Contacto actualizado; versión anterior conservada en el historial.";
            return RedirectToPage(new { Id });
        }
        await Load();
        return Page();
    }

    public async Task<IActionResult> OnPostIdentifierAsync(string idType, string? idValue, string? reason)
    {
        if (await Try(() => identity.AddIdentifier(Actor, Id, idType, idValue ?? "", null, string.IsNullOrWhiteSpace(reason) ? "documento agregado" : reason)))
        {
            Flash = "Documento agregado.";
            return RedirectToPage(new { Id });
        }
        await Load();
        return Page();
    }

    public async Task<IActionResult> OnPostNewbornsAsync(string? sexes)
    {
        var list = (sexes ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToUpperInvariant() switch { "F" => "female", "M" => "male", _ => "unknown" }).ToList();
        IReadOnlyList<Climesa.Identity.Contracts.PersonSummary>? born = null;
        if (list.Count > 0 && await Try(async () => born = await identity.RegisterNewborns(Actor, Id, list, NewKey())))
        {
            Flash = "Recién nacido(s) registrados: " + string.Join(", ", born!.Select(b => $"{b.DisplayName} ({b.Mrn})"));
            return RedirectToPage(new { Id });
        }
        await Load();
        return Page();
    }

    private async Task Load() => await Try(async () => Detail = await identity.GetDetail(Actor, Id));
}
