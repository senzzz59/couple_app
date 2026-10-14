import { Alert, Platform } from 'react-native';

/** 跨平台确认框（Web 上没有 Alert 按钮） */
export function confirm(title: string, message: string, okText = '删除'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}
