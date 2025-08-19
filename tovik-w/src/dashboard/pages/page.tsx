import React from "react";
import { embedScript } from "@wix/app-management_embedded-scripts";



export default function ActivateTovikPage() {
  async function handleActivate() {
    try {
      await embedScript(); 
      alert("Tovik activated! Please publish your site to apply the changes.");
    } catch (e: any) {
      alert(e?.message || "Activation failed. Please try again.");
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Tovik</h1>
      <p>
        Instantly translate your Wix site into multiple languages. No code required —
        just click the button below.
      </p>
      <button
        onClick={handleActivate}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          background: "black",
          color: "white",
          border: "none",
          cursor: "pointer",
          marginTop: "12px",
        }}
      >
        Activate Tovik
      </button>
    </main>
  );
}
