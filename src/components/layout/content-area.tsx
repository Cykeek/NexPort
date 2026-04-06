"use client";

import { ReactNode } from "react";

interface ContentAreaProps {
  children: ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return (
    <div className="content-area">
      <div className="content-scroll">
        {children}
      </div>
    </div>
  );
}