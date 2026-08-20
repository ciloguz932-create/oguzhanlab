import { router as expoRouter } from "expo-router";

type AppRoute = string | Record<string, unknown>;

/**
 * Route dosyaları çalışma anında Expo Router tarafından çözülür. Bu sarmalayıcı,
 * geliştirme sunucusunun geçici olarak eski typed-route bildirimini tutması
 * durumunda bile gerçek rota çözümlemesini değiştirmeden güvenli geçiş sağlar.
 */
export const router = {
  push: (href: AppRoute) => expoRouter.push(href as never),
  replace: (href: AppRoute) => expoRouter.replace(href as never),
  back: () => expoRouter.back(),
};
