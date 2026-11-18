export function createFloorStore() {
  let snapshot = { selected: null, layer: 'live', frame: {}, follow: 0, camera: 'fit', cameraRevision: 0 };
  let view = '3d';
  let selectStation;
  let selectWorker;
  const listeners = new Set();
  const viewListeners = new Set();

  function publish(next) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    subscribeView(listener) {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
    select: (id) => selectStation?.(id),
    follow: (id) => selectWorker?.(id),
    connect(select, follow) {
      selectStation = select;
      selectWorker = follow;
      return {
        setView(next) {
          if (view === next) return;
          view = next;
          for (const listener of viewListeners) listener();
        },
        update(model, frame, selected, layer, run, clock, follow) {
          publish({ model, frame, selected, layer, run, clock, follow });
        },
        reset() {
          publish({ camera: 'fit', cameraRevision: snapshot.cameraRevision + 1 });
        },
        focus() {
          publish({ camera: 'station', cameraRevision: snapshot.cameraRevision + 1 });
        },
      };
    },
  };
}
