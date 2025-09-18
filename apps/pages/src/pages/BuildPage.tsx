import React, { useEffect, useMemo, useState } from "react";
import { apiClient, ApiCampaign, ApiMap, ApiRegion, ApiMarker } from "../api/client";
import { useAuth } from "../context/AuthContext";
import MapStage from "../components/MapStage";
import SessionSidebar from "../components/SessionSidebar";
import { useSessionSocket } from "../hooks/useSessionSocket";

const defaultRegion = "[[0,0],[100,0],[100,100],[0,100]]";

const BuildPage: React.FC = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<ApiCampaign[]>([]);
  const [maps, setMaps] = useState<ApiMap[]>([]);
  const [regions, setRegions] = useState<ApiRegion[]>([]);
  const [markers, setMarkers] = useState<ApiMarker[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", isPublic: false });
  const [regionForm, setRegionForm] = useState({ name: "New Region", polygon: defaultRegion, orderIndex: 0 });
  const [markerForm, setMarkerForm] = useState({ name: "", markerType: "note", x: 100, y: 100 });
  const [sessionName, setSessionName] = useState("Live Session");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedMap = useMemo(() => maps.find((m) => m.id === selectedMapId) ?? null, [maps, selectedMapId]);

  const sessionSocket = useSessionSocket(activeSessionId, { name: user?.displayName ?? "DM", role: "dm" });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const data = await apiClient.listCampaigns(false);
        setCampaigns(data);
        if (data.length > 0) {
          setSelectedCampaignId((prev) => prev || data[0].id);
        }
      } catch (err) {
        console.error(err);
        setStatusMessage((err as Error).message);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const loadMaps = async () => {
      try {
        const result = await apiClient.listMaps(selectedCampaignId);
        setMaps(result);
        if (result.length > 0) {
          setSelectedMapId((prev) => prev || result[0].id);
        }
      } catch (err) {
        setStatusMessage((err as Error).message);
      }
    };
    loadMaps();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedMapId) return;
    const loadRegions = async () => {
      try {
        const regionData = await apiClient.listRegions(selectedMapId);
        setRegions(regionData);
      } catch (err) {
        setStatusMessage((err as Error).message);
      }
    };
    const loadMarkers = async () => {
      try {
        const markerData = await apiClient.listMarkers(selectedMapId);
        setMarkers(markerData);
      } catch (err) {
        setStatusMessage((err as Error).message);
      }
    };
    loadRegions();
    loadMarkers();
  }, [selectedMapId]);

  const handleCreateCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await apiClient.createCampaign(campaignForm);
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaignId(created.id);
      setCampaignForm({ name: "", description: "", isPublic: false });
      setStatusMessage("Campaign created");
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleCreateRegion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMapId) return;
    try {
      const polygon = JSON.parse(regionForm.polygon);
      const created = await apiClient.createRegion(selectedMapId, {
        name: regionForm.name,
        polygon,
        orderIndex: regionForm.orderIndex
      });
      setRegions((prev) => [...prev, created]);
      setRegionForm({ name: "New Region", polygon: defaultRegion, orderIndex: 0 });
      setStatusMessage("Region saved");
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleCreateMarker = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMapId) return;
    try {
      const created = await apiClient.createMarker(selectedMapId, {
        name: markerForm.name,
        markerType: markerForm.markerType,
        position: { x: markerForm.x, y: markerForm.y }
      });
      setMarkers((prev) => [...prev, created]);
      setMarkerForm({ name: "", markerType: "note", x: 100, y: 100 });
      setStatusMessage("Marker saved");
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleStartSession = async () => {
    if (!selectedCampaignId || !selectedMapId) return;
    try {
      const session = await apiClient.createSession({ campaignId: selectedCampaignId, mapId: selectedMapId, name: sessionName });
      setActiveSessionId(session.id);
      setStatusMessage(`Session ${session.name} created`);
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleReveal = (regionId: string) => {
    if (!sessionSocket.send || !activeSessionId) return;
    sessionSocket.send({ type: "revealRegions", regionIds: [regionId] });
  };

  const handleHide = (regionId: string) => {
    if (!sessionSocket.send || !activeSessionId) return;
    sessionSocket.send({ type: "hideRegions", regionIds: [regionId] });
  };

  const handleDropMarker = (marker: ApiMarker) => {
    if (!sessionSocket.send || !activeSessionId) return;
    sessionSocket.send({ type: "placeMarker", marker });
  };

  const handleSaveSession = async () => {
    if (!activeSessionId) return;
    try {
      const result = await apiClient.saveSession(activeSessionId);
      setStatusMessage(`Session snapshot saved: ${result.backupKey}`);
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleEndSession = async () => {
    if (!activeSessionId) return;
    try {
      await apiClient.endSession(activeSessionId);
      setStatusMessage("Session ended");
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const liveMarkers = sessionSocket.state?.markers ?? Object.fromEntries(markers.map((m) => [m.id, m]));
  const liveRegions = sessionSocket.state?.regions ?? regions;
  const revealedIds = sessionSocket.state?.revealedRegions ?? [];
  const liveMap = sessionSocket.state?.map ?? selectedMap;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Dungeon Master Build Mode</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Prepare campaigns, sculpt fog-of-war, and manage live sessions.</p>
          </div>
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{statusMessage}</div>
        </header>
        <div className="grid gap-6 md:grid-cols-3">
          <form onSubmit={handleCreateCampaign} className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Create Campaign</h2>
            <input
              type="text"
              required
              placeholder="Campaign name"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
            <textarea
              placeholder="Description"
              value={campaignForm.description}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))}
              className="h-24 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={campaignForm.isPublic}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, isPublic: e.target.checked }))}
              />
              Public listing
            </label>
            <button type="submit" className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500">
              Save Campaign
            </button>
          </form>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Campaign Assets</h2>
            <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Select Campaign</label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Select Map</label>
            <select
              value={selectedMapId}
              onChange={(e) => setSelectedMapId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload map art by calling <span className="font-semibold">Create Map</span> from the API to receive temporary R2 uploads.
            </p>
          </div>
          <form onSubmit={handleCreateRegion} className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Add Region</h2>
            <input
              type="text"
              required
              placeholder="Region name"
              value={regionForm.name}
              onChange={(e) => setRegionForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
            <textarea
              required
              value={regionForm.polygon}
              onChange={(e) => setRegionForm((prev) => ({ ...prev, polygon: e.target.value }))}
              className="h-24 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
            <input
              type="number"
              value={regionForm.orderIndex}
              onChange={(e) => setRegionForm((prev) => ({ ...prev, orderIndex: Number(e.target.value) }))}
              className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
            <button type="submit" className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500">
              Save Region
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <MapStage
            map={liveMap as any}
            regions={liveRegions}
            revealedRegionIds={revealedIds}
            markers={liveMarkers}
            onMarkerSelect={() => {}}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Reveal Control</h3>
              <ul className="space-y-2 text-sm">
                {regions.map((region) => {
                  const revealed = revealedIds.includes(region.id);
                  return (
                    <li key={region.id} className="flex items-center justify-between rounded-md border border-slate-200/60 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200">{region.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Order {region.orderIndex}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReveal(region.id)}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-emerald-500"
                        >
                          Reveal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHide(region.id)}
                          className="rounded-md bg-slate-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-slate-500"
                          disabled={!revealed}
                        >
                          Hide
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <form onSubmit={handleCreateMarker} className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Add Marker</h3>
              <input
                type="text"
                required
                placeholder="Marker label"
                value={markerForm.name}
                onChange={(e) => setMarkerForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
              />
              <select
                value={markerForm.markerType}
                onChange={(e) => setMarkerForm((prev) => ({ ...prev, markerType: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="note">Note</option>
                <option value="enemy">Enemy</option>
                <option value="ally">Ally</option>
                <option value="trap">Trap</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  X
                  <input
                    type="number"
                    value={markerForm.x}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, x: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
                <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Y
                  <input
                    type="number"
                    value={markerForm.y}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, y: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500">
                  Save Marker
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const marker = markers.find((m) => m.name === markerForm.name);
                    if (marker) handleDropMarker(marker);
                  }}
                  className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-slate-600"
                >
                  Push Live
                </button>
              </div>
            </form>
          </div>
        </div>
        <SessionSidebar
          players={sessionSocket.players}
          lastEvent={sessionSocket.lastEvent}
          connection={sessionSocket.connection}
          onReconnect={sessionSocket.reconnect}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">Live Session Lifecycle</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Session name</span>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={handleStartSession}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
          >
            Start Session
          </button>
          <button
            type="button"
            onClick={handleSaveSession}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          >
            Save Snapshot
          </button>
          <button
            type="button"
            onClick={handleEndSession}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-rose-500"
          >
            End Session
          </button>
        </div>
      </section>
    </div>
  );
};

export default BuildPage;
