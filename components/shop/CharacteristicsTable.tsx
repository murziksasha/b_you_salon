interface Props {
  raw: string;
}

/**
 * Parses "Key: Value" free-text characteristics and renders them as a table.
 * Server component — no client overhead.
 */
export function CharacteristicsTable({ raw }: Props) {
  const rows = raw
    .split('\n')
    .map(line => {
      const colon = line.indexOf(':');
      if (colon < 1) return null;
      return {
        label: line.slice(0, colon).trim(),
        value: line.slice(colon + 1).trim(),
      };
    })
    .filter((r): r is { label: string; value: string } => r !== null && Boolean(r.label));

  if (!rows.length) return null;

  return (
    <table className='shop-char-table'>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <th scope='row'>{r.label}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
