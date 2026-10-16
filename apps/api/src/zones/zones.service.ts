import {
  quoteJob,
  type CreateZoneInput,
  type PricingRules,
  type PricingRulesInput,
  type PricedStop,
  type Quote,
  type StopKind,
  type UpdateZoneInput,
} from '@enhora/shared';
import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { cities, pricingRules, zones } from '../db/schema.js';
import type { LngLat } from '../db/geo.js';

export interface QuotedStop {
  kind: StopKind;
  location: LngLat;
}

export interface QuoteResult {
  quote: Quote;
  /** Zone of each stop, same order as the input. */
  zoneIds: string[];
}

@Injectable()
export class ZonesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: CreateZoneInput): Promise<{ id: string }> {
    const cityId = await this.requireCityId(input.citySlug);
    const geojson = JSON.stringify(input.area);

    return this.db.transaction(async (tx) => {
      // Serialize zone writes per city so two concurrent inserts cannot both pass the overlap check.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${cityId}))`);

      const [check] = await tx.execute<{ valid: boolean; overlaps: boolean }>(sql`
        with g as (select ST_Multi(ST_GeomFromGeoJSON(${geojson}))::geometry(MultiPolygon, 4326) as area)
        select ST_IsValid(g.area) as valid,
               exists(
                 select 1 from ${zones} z
                 where z.city_id = ${cityId} and z.active
                   and ST_Area(ST_Intersection(z.area, g.area)) > 0
               ) as overlaps
        from g`);
      if (!check?.valid) throw new UnprocessableEntityException('El polígono no es válido (se cruza consigo mismo)');
      if (check.overlaps) throw new ConflictException('La zona se superpone con otra zona activa');

      const [row] = await tx.execute<{ id: string }>(sql`
        insert into ${zones} (city_id, name, fee_cents, area)
        values (${cityId}, ${input.name}, ${input.feeCents}, ST_Multi(ST_GeomFromGeoJSON(${geojson})))
        returning id`);
      return { id: row!.id };
    });
  }

  async list(citySlug: string) {
    const cityId = await this.requireCityId(citySlug);
    const rows = await this.db.execute<{
      id: string;
      name: string;
      feeCents: string;
      active: boolean;
      area: string;
    }>(sql`
      select id, name, fee_cents as "feeCents", active, ST_AsGeoJSON(area, 6) as area
      from ${zones} where city_id = ${cityId} order by fee_cents, name`);
    return rows.map((r) => ({ ...r, feeCents: Number(r.feeCents), area: JSON.parse(r.area) as unknown }));
  }

  async update(id: string, input: UpdateZoneInput): Promise<void> {
    const rows = await this.db.update(zones).set(input).where(eq(zones.id, id)).returning({ id: zones.id });
    if (rows.length === 0) throw new NotFoundException('Zona inexistente');
  }

  async getPricing(citySlug: string): Promise<PricingRulesInput> {
    const cityId = await this.requireCityId(citySlug);
    const [row] = await this.db
      .select({
        extraStopFeeCents: pricingRules.extraStopFeeCents,
        errandFeeCents: pricingRules.errandFeeCents,
        surchargeBps: pricingRules.surchargeBps,
        roundToCents: pricingRules.roundToCents,
        freeWaitMinutes: pricingRules.freeWaitMinutes,
        waitFeePerMinuteCents: pricingRules.waitFeePerMinuteCents,
      })
      .from(pricingRules)
      .where(eq(pricingRules.cityId, cityId));
    if (!row) throw new NotFoundException('La ciudad no tiene tarifas configuradas');
    return row;
  }

  async setPricing(citySlug: string, input: PricingRulesInput): Promise<void> {
    const cityId = await this.requireCityId(citySlug);
    await this.db
      .insert(pricingRules)
      .values({ cityId, ...input })
      .onConflictDoUpdate({ target: pricingRules.cityId, set: input });
  }

  /** Prices a list of stops in a city. Throws 422 listing the stops outside every active zone. */
  async quote(cityId: string, stops: readonly QuotedStop[]): Promise<QuoteResult> {
    const [rules, located] = await Promise.all([this.rules(cityId), this.locate(cityId, stops)]);
    const priced: PricedStop[] = stops.map((s, i) => ({ kind: s.kind, zoneId: located[i]?.zoneId ?? null }));
    const uncovered = priced.flatMap((s, i) => (s.zoneId === null ? [i] : []));
    if (uncovered.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Hay direcciones fuera de la zona de cobertura',
        stopIndexes: uncovered,
      });
    }
    const zoneFees = Object.fromEntries(located.map((l) => [l.zoneId, l.feeCents]));
    return { quote: quoteJob(priced, { ...rules, zoneFees }), zoneIds: priced.map((s) => s.zoneId!) };
  }

  private async rules(cityId: string): Promise<Omit<PricingRules, 'zoneFees'>> {
    const [row] = await this.db.select().from(pricingRules).where(eq(pricingRules.cityId, cityId));
    if (!row) throw new UnprocessableEntityException('La ciudad no tiene tarifas configuradas');
    return {
      extraStopFee: row.extraStopFeeCents,
      errandFee: row.errandFeeCents,
      surchargeBps: row.surchargeBps,
      roundToCents: row.roundToCents,
      freeWaitMinutes: row.freeWaitMinutes,
      waitFeePerMinute: row.waitFeePerMinuteCents,
    };
  }

  /** Finds the active zone covering each point, in a single query. */
  private async locate(
    cityId: string,
    stops: readonly QuotedStop[],
  ): Promise<{ zoneId: string | null; feeCents: number }[]> {
    const points = sql.join(
      stops.map((s, i) => sql`(${i}::int, ${s.location.lng}::float8, ${s.location.lat}::float8)`),
      sql`, `,
    );
    const rows = await this.db.execute<{ idx: number; zoneId: string | null; feeCents: string | null }>(sql`
      select p.idx, z.id as "zoneId", z.fee_cents as "feeCents"
      from (values ${points}) as p(idx, lng, lat)
      left join lateral (
        select id, fee_cents from ${zones}
        where city_id = ${cityId} and active
          and ST_Covers(area, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))
        order by fee_cents desc limit 1
      ) z on true
      order by p.idx`);
    return rows.map((r) => ({ zoneId: r.zoneId, feeCents: Number(r.feeCents ?? 0) }));
  }

  private async requireCityId(slug: string): Promise<string> {
    const [city] = await this.db.select({ id: cities.id }).from(cities).where(eq(cities.slug, slug));
    if (!city) throw new NotFoundException('Ciudad inexistente');
    return city.id;
  }
}
