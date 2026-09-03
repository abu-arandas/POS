import React from 'react';
import { code128Modules, BarcodeSvgOptions } from '../lib/barcode';

interface BarcodeSvgProps {
  data: string;
  options?: BarcodeSvgOptions;
}

/**
 * Renders a payload as an inline Code 128 SVG. Inline rather than an <img> so
 * it prints crisply and needs no network fetch.
 */
export function BarcodeSvg({ data, options = {} }: BarcodeSvgProps) {
  const height = options.height ?? 44;
  const mw = options.moduleWidth ?? 1.6;

  const widths = code128Modules(data);
  const totalModules = widths.reduce((a, b) => a + b, 0);
  const w = totalModules * mw;

  const rects: React.ReactElement[] = [];
  let x = 0;
  let bar = true; // sequence starts with a bar

  for (let i = 0; i < widths.length; i++) {
    const width = widths[i];
    if (bar) {
      rects.push(
        <rect
          key={i}
          x={(x * mw).toFixed(2)}
          y="0"
          width={(width * mw).toFixed(2)}
          height={height}
        />,
      );
    }
    x += width;
    bar = !bar;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w.toFixed(1)}
      height={height}
      viewBox={`0 0 ${w.toFixed(1)} ${height}`}
      fill="#000"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${data}`}
    >
      <title>{`Barcode ${data}`}</title>
      {rects}
    </svg>
  );
}
