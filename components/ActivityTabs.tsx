"use client";

import { useRef, useState } from "react";

import type { Activity } from "@/lib/model";
import { ActivitiesView } from "./sections";

export type ActivityList = {
  id: string;
  label: string;
  items: Activity[];
};

/**
 * One "Things to do" section with a toggle between the lists, instead of a
 * separate section per place. Both panels stay in the DOM (the inactive one is
 * `hidden`) so the whole list is still findable with the browser's find, and
 * still present with JavaScript disabled.
 */
export default function ActivityTabs({ lists }: { lists: ActivityList[] }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  if (lists.length === 0) return null;
  if (lists.length === 1) return <ActivitiesView items={lists[0].items} />;

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + lists.length) % lists.length;
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <>
      <div className="switch" role="tablist" aria-label="Things to do" onKeyDown={onKeyDown}>
        {lists.map((list, i) => {
          const hikes = list.items.filter((a) => a.isHike).length;
          return (
            <button
              key={list.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${list.id}`}
              aria-selected={i === active}
              aria-controls={`panel-${list.id}`}
              tabIndex={i === active ? 0 : -1}
              className={`switch-btn${i === active ? " is-active" : ""}`}
              onClick={() => setActive(i)}
            >
              {list.label}
              <span className="switch-count">
                {list.items.length}
                {hikes > 0 && ` · ${hikes} hikes`}
              </span>
            </button>
          );
        })}
      </div>

      {lists.map((list, i) => (
        <div
          key={list.id}
          id={`panel-${list.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${list.id}`}
          hidden={i !== active}
        >
          <ActivitiesView items={list.items} />
        </div>
      ))}
    </>
  );
}
