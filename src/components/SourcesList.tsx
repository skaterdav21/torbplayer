import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FlatList } from 'react-native';

import { useSend, type SendMeta } from '../cast/SendContext';
import { useSources } from '../hooks/useSources';
import type { StreamInfo } from '../lib/streamInfo';
import { SourceRow } from './SourceRow';
import { filterSources, SourcesFooter, SourcesHeader, type QualityFilter } from './SourcesSection';

/** Full-screen list of sources for one movie or episode, with whatever header the screen wants on top. */
export function SourcesList({ meta, videoId, header }: { meta: SendMeta; videoId: string; header: ReactElement }) {
  const { items, statuses, loading, reload, hasAddons, addonsLoaded } = useSources(meta.type, videoId);
  const { send, phase, pendingKey } = useSend();
  const [quality, setQuality] = useState<QualityFilter>('all');
  const [showUnsendable, setShowUnsendable] = useState(false);

  const visible = useMemo(() => filterSources(items, quality, showUnsendable), [items, quality, showUnsendable]);
  const onPress = useCallback((info: StreamInfo) => send({ info, meta }), [send, meta]);
  const onLongPress = useCallback((info: StreamInfo) => send({ info, meta }, { chooseDevice: true }), [send, meta]);
  const busyKey = phase === 'loading' || phase === 'connecting' ? pendingKey : undefined;

  return (
    <FlatList
      data={hasAddons ? visible : []}
      keyExtractor={(s) => s.key}
      extraData={busyKey}
      renderItem={({ item }) => (
        <SourceRow info={item} busy={item.key === busyKey} onPress={onPress} onLongPress={onLongPress} />
      )}
      ListHeaderComponent={
        <>
          {header}
          <SourcesHeader
            items={items}
            statuses={statuses}
            loading={loading}
            hasAddons={hasAddons}
            addonsLoaded={addonsLoaded}
            quality={quality}
            onQuality={setQuality}
          />
        </>
      }
      ListFooterComponent={
        hasAddons ? (
          <SourcesFooter
            items={items}
            visibleCount={visible.length}
            loading={loading}
            showUnsendable={showUnsendable}
            onToggleUnsendable={() => setShowUnsendable((v) => !v)}
            onRetry={reload}
          />
        ) : undefined
      }
      initialNumToRender={12}
      windowSize={9}
    />
  );
}
