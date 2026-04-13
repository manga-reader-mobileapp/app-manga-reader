import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibraryView } from '@/components/library-view';

export default function LibraryTabScreen() {
  const insets = useSafeAreaInsets();
  return <LibraryView topInset={insets.top} showHeader={true} />;
}
