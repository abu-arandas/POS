import React from 'react';
import { code128Modules, BarcodeSvgOptions } from '../lib/barcode';

interface BarcodeSvgProps {
  data: string;
  options?: BarcodeSvgOptions;
}

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
    >
      {rects}
    </svg>
  );
}
