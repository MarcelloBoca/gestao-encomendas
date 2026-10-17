"use client";

import { useRef } from "react";
import { selectStore } from "@/app/actions/settings";
import type { Store } from "@/lib/types";

export default function StorePicker({ stores, storeId, back }: { stores: Store[]; storeId: string; back: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  if (stores.length <= 1) {
    return <span className="store-label">{stores[0]?.name ?? "Sem loja"}</span>;
  }
  return (
    <form ref={formRef} action={selectStore}>
      <input type="hidden" name="back" value={back} />
      <label className="visually-hidden" htmlFor="store-picker">
        Loja
      </label>
      <select
        id="store-picker"
        name="storeId"
        className="store-select"
        defaultValue={storeId}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </form>
  );
}
