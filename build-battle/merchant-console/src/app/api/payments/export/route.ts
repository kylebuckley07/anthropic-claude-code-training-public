import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import { exportFilename, parseExportColumns, toCsv } from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

const SCOPES = ["filtered", "all"] as const
type Scope = (typeof SCOPES)[number]

/**
 * Exports the payments table as CSV.
 *
 * Ops chooses the columns and the scope (NWP-101). Both arrive from the
 * client, so both are checked here before they reach the query or the
 * filename. Every row goes through the one query builder, unpaginated.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const scopeParam = params.get("scope") ?? "filtered"
  if (!SCOPES.includes(scopeParam as Scope)) {
    return NextResponse.json(
      { error: "Scope must be the current filter or all payments." },
      { status: 400 },
    )
  }
  const scope = scopeParam as Scope

  const parsed = parseExportColumns(params.get("columns"))
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const filters = parseFilters(
    scope === "all" ? new URLSearchParams() : params,
  )
  const rows = sortPayments(
    filterPayments(filters),
    filters.sort,
    filters.direction,
  )

  return new Response(toCsv(rows, parsed.columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(new Date(), filenameLabel(scope, filters))}"`,
    },
  })
}

/** Built from checked values only, so free text never reaches a filename. */
function filenameLabel(
  scope: Scope,
  filters: ReturnType<typeof parseFilters>,
): string {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  const narrowed = filters.merchantId || filters.search || filters.from || filters.to
  return narrowed ? "filtered" : "all"
}
