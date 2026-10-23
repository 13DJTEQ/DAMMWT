/** Atmospheric Fibonacci / gold spiral backdrop (decorative, non-interactive). */
export function SpiralAccent(): JSX.Element {
  return (
    <div className="spiral-accent" aria-hidden="true">
      <img
        className="spiral-accent__img spiral-accent__img--primary"
        src="/brand/gold-spiral.png"
        alt=""
      />
      <img
        className="spiral-accent__img spiral-accent__img--secondary"
        src="/brand/fibonacci-iris.png"
        alt=""
      />
    </div>
  );
}
