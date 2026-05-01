export function ExportPreviewTable({
  columns,
  rows,
  footer,
}: {
  columns: Array<{ key: string; header: string }>
  rows: Array<Record<string, string>>
  footer?: string
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-dashed border-[#2a2826] bg-[#0e0e0e]/80">
      <table className="w-full min-w-[260px] border-collapse text-left text-[11px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="border-b border-[#2a2826] bg-[#141210] px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[#8b8780]"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-[#2a2826]/40 last:border-b-0"
            >
              {columns.map((c) => {
                const cell = row[c.key] ?? ''
                return (
                  <td
                    key={c.key}
                    className="max-w-[280px] px-2 py-1.5 align-top font-mono text-[#e8e4dc] break-words whitespace-normal"
                  >
                    {cell === '' ? (
                      <span className="text-[#3d3a36]" aria-hidden>
                        {'\u00a0'}
                      </span>
                    ) : (
                      cell
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {footer ? (
        <p className="border-t border-[#2a2826]/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[#6d6b67]">
          {footer}
        </p>
      ) : null}
    </div>
  )
}
