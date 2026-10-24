using Climesa.Care.Application;
using Climesa.Identity.Contracts;
using Climesa.Web.Infrastructure;

namespace Climesa.Web.Pages.Hospitalizacion;

public class IndexModel(ActorAccessor actors, CareService care, IIdentityModule identity) : AppPage(actors)
{
    public sealed record Row(Guid EpisodeId, string Name, string Mrn, string? Location, DateTimeOffset? AdmittedAt, string Status);

    public List<Row> Rows { get; } = [];

    public async Task OnGetAsync()
    {
        await Try(async () =>
        {
            foreach (var e in await care.ActiveEpisodes(Actor))
            {
                var p = await identity.GetSummary(e.PersonId);
                Rows.Add(new Row(e.EpisodeId, p?.DisplayName ?? "?", p?.Mrn ?? "", e.Location, e.AdmittedAt, e.Status));
            }
        });
    }
}
