import type { Tag as TagT } from "../data/bundle";

const LABEL: Record<TagT, string> = {
  OBSERVED: "Observed", DERIVED: "Derived", HISTORICAL: "Historical",
  PREDICTED: "Predicted", SCENARIO: "Scenario", ASSUMPTION: "Assumption",
};
const HELP: Record<TagT, string> = {
  OBSERVED: "Measured by a NASA instrument",
  DERIVED: "Computed from observed data",
  HISTORICAL: "Past record, not live",
  PREDICTED: "Modelled for the chosen time",
  SCENARIO: "Invented event or placeholder value, used to exercise the system",
  ASSUMPTION: "Our modelling choice, adjustable",
};

export function Tag({ t }: { t: TagT }) {
  return <span className={`tag tag-${t.toLowerCase()}`} title={HELP[t]}>{LABEL[t]}</span>;
}

export function Reading({ value, unit, label, tag }: { value: string; unit?: string; label: string; tag?: TagT }) {
  return (
    <div className="reading">
      <div className="reading-label">{label}{tag && <Tag t={tag} />}</div>
      <div className="reading-value">{value}{unit && <span className="reading-unit">{unit}</span>}</div>
    </div>
  );
}
