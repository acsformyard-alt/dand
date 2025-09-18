import React, { useEffect, useRef } from "react";

type MaskCanvasProps = {
  width: number;
  height: number;
  revealedPolygons: number[][][];
  opacity?: number;
};

const MaskCanvas: React.FC<MaskCanvasProps> = ({ width, height, revealedPolygons, opacity = 0.92 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(15, 23, 42, ${opacity})`;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
    revealedPolygons.forEach((points) => {
      if (!points.length) return;
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      ctx.fill();
    });

    ctx.globalCompositeOperation = "source-over";
  }, [width, height, revealedPolygons, opacity]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
};

export default MaskCanvas;
