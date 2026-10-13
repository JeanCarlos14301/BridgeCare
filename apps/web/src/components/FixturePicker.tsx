import type { Fixture } from "../api";

export function FixturePicker(props: {
  fixtures: Fixture[];
  activeId: string | null;
  busy: boolean;
  onPick: (fixtureId: string) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="Synthetic fixtures">
      {props.fixtures.map((fixture, index) => (
        <button
          type="button"
          key={fixture.id}
          className="segment"
          aria-pressed={fixture.id === props.activeId}
          disabled={props.busy}
          title={fixture.description}
          onClick={() => props.onPick(fixture.id)}
        >
          <span className="segment-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          {fixture.title}
        </button>
      ))}
    </div>
  );
}
