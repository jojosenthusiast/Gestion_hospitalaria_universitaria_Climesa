using Climesa.Migration.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Migracion;

public class LoteModel(ActorAccessor actors, MigrationService migration) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid Id { get; set; }
    public BatchSummary? Batch { get; private set; }
    public IReadOnlyList<BatchItemView> Items { get; private set; } = [];

    public async Task OnGetAsync()
    {
        await Try(async () => Batch = await migration.Get(Actor, Id));
        await Try(async () => Items = await migration.Items(Actor, Id));
    }
}
