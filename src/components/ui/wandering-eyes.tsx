"use client";

import { useEffect, useRef } from "react";

interface WanderingEyesProps {
  className?: string;
  /** Animation duration in ms. Default 3000 */
  duration?: number;
  /** Color for the eye outline. Defaults to currentColor at 0.2 opacity */
  eyeColor?: string;
  /** Color for the pupils. Defaults to currentColor */
  pupilColor?: string;
}

/**
 * Animated "Wandering Eyes" loading indicator.
 * Must be placed in a container with a 9/4 aspect ratio.
 * The eyes look around randomly to create an expressive waiting state.
 */
export function WanderingEyes({
  className = "",
  duration = 3000,
  eyeColor,
  pupilColor,
}: WanderingEyesProps) {
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    let startTime = performance.now();
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let nextChangeAt = 0;

    const maxTravel = 4;

    function pickTarget() {
      targetX = (Math.random() - 0.5) * maxTravel * 2;
      targetY = (Math.random() - 0.5) * maxTravel * 1.5;
      nextChangeAt = performance.now() + 600 + Math.random() * 1200;
    }

    pickTarget();

    function animate() {
      const now = performance.now();
      if (now >= nextChangeAt) pickTarget();

      // Smooth lerp
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      if (leftPupilRef.current) {
        leftPupilRef.current.setAttribute("cx", String(30 + currentX));
        leftPupilRef.current.setAttribute("cy", String(24 + currentY));
      }
      if (rightPupilRef.current) {
        rightPupilRef.current.setAttribute("cx", String(60 + currentX));
        rightPupilRef.current.setAttribute("cy", String(24 + currentY));
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [duration]);

  return (
    <div
      className={`wandering-eyes ${className}`}
      style={{ aspectRatio: "9 / 4", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <svg
        viewBox="0 0 90 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Left eye outline */}
        <ellipse
          cx="30"
          cy="24"
          rx="14"
          ry="16"
          stroke={eyeColor || "currentColor"}
          strokeWidth="2"
          opacity="0.2"
          fill="none"
        />
        {/* Right eye outline */}
        <ellipse
          cx="60"
          cy="24"
          rx="14"
          ry="16"
          stroke={eyeColor || "currentColor"}
          strokeWidth="2"
          opacity="0.2"
          fill="none"
        />
        {/* Left pupil */}
        <circle
          ref={leftPupilRef}
          cx="30"
          cy="24"
          r="5"
          fill={pupilColor || "currentColor"}
        />
        {/* Right pupil */}
        <circle
          ref={rightPupilRef}
          cx="60"
          cy="24"
          r="5"
          fill={pupilColor || "currentColor"}
        />
      </svg>
    </div>
  );
}
