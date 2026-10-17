import { createContext, useContext, useEffect, useState } from "react";

export type WorkspaceViewSettings = {
  density: "compact" | "comfortable";
  pinPanels: boolean;
  panelHeight: number;
  showDiagnostics: boolean;
  resizablePanels: boolean;
};

export const defaultWorkspaceViewSettings: WorkspaceViewSettings = {
  density: "compact",
  pinPanels: true,
  panelHeight: 72,
  showDiagnostics: true,
  resizablePanels: true,
};

const WorkspaceViewSettingsContext = createContext<{
  settings: WorkspaceViewSettings;
  setSettings: React.Dispatch<React.SetStateAction<WorkspaceViewSettings>>;
} | null>(null);

export function WorkspaceViewSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceViewSettings>(() => {
    try { return { ...defaultWorkspaceViewSettings, ...JSON.parse(localStorage.getItem("sil-workspace-view-settings") || "{}") }; }
    catch { return defaultWorkspaceViewSettings; }
  });

  useEffect(() => { localStorage.setItem("sil-workspace-view-settings", JSON.stringify(settings)); }, [settings]);
  return <WorkspaceViewSettingsContext.Provider value={{ settings, setSettings }}>{children}</WorkspaceViewSettingsContext.Provider>;
}

export function useWorkspaceViewSettings() {
  const context = useContext(WorkspaceViewSettingsContext);
  if (!context) throw new Error("Workspace view settings require WorkspaceViewSettingsProvider.");
  return context;
}
