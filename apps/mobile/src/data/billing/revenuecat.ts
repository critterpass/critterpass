/**
 * The store, through RevenueCat (StoreKit 2 / Play Billing). Everything the app needs from it sits
 * behind {@link StorePort}, so the purchase flow is tested without a store and the rest of the app
 * never imports the SDK. RevenueCat's appUserID is the Critterpass uid (a UUID, which RevenueCat
 * also passes as the iOS `appAccountToken`); our API, not RevenueCat, decides entitlements.
 *
 * The public SDK keys are `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
 * (EAS environment variables). Without one, billing is unavailable and every paywall shows its
 * "purchases unavailable" state.
 */
import type { StorePlatform } from '@cp/domain';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

export interface StoreProduct {
  readonly id: string;
  readonly title: string;
  /** The store's own localised price, the only price the app may show for a purchase. */
  readonly priceString: string;
  readonly price: number;
  readonly currencyCode: string;
  /** ISO 8601 period (`P1M`, `P1Y`) for subscriptions, `null` for one-off products. */
  readonly subscriptionPeriod: string | null;
}

export type StorePurchaseOutcome =
  | { readonly kind: 'success'; readonly transactionId: string; readonly productId: string }
  | { readonly kind: 'pending' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly code: string };

export interface StoreTransaction {
  readonly transactionId: string;
  readonly productId: string;
}

export type RestoreOutcome =
  | { readonly kind: 'restored'; readonly transactions: readonly StoreTransaction[] }
  | { readonly kind: 'other_account' }
  | { readonly kind: 'failed'; readonly code: string };

export interface StorePort {
  readonly platform: StorePlatform;
  logIn(uid: string): Promise<void>;
  products(ids: readonly string[]): Promise<StoreProduct[]>;
  purchase(productId: string): Promise<StorePurchaseOutcome>;
  restore(): Promise<RestoreOutcome>;
  /** RevenueCat subscriber attributes, e.g. `boost_intent_id` before a boost purchase. */
  setAttributes(attributes: Readonly<Record<string, string | null>>): Promise<void>;
  /** Every purchase the store finishes later (Ask to Buy, SCA, an interrupted purchase). */
  onTransactions(listener: (transactions: readonly StoreTransaction[]) => void): () => void;
  showManageSubscriptions(): Promise<void>;
}

export function storePlatform(os: string = Platform.OS): StorePlatform | null {
  if (os === 'ios') return 'app_store';
  if (os === 'android') return 'play';
  return null;
}

export function revenueCatKey(
  platform: StorePlatform,
  env: Readonly<Record<string, string | undefined>> = {
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  },
): string | null {
  const name =
    platform === 'app_store'
      ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY'
      : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';
  const key = env[name]?.trim();
  return key ? key : null;
}

/** Every transaction the customer holds: subscriptions' latest and one-off purchases. */
export function transactionsOf(info: CustomerInfo): StoreTransaction[] {
  const oneOff = info.nonSubscriptionTransactions.map((transaction) => ({
    transactionId: transaction.transactionIdentifier,
    productId: transaction.productIdentifier,
  }));
  const subscriptions = Object.values(info.subscriptionsByProductIdentifier ?? {}).flatMap(
    (subscription) =>
      subscription.isActive && subscription.storeTransactionId
        ? [
            {
              transactionId: subscription.storeTransactionId,
              productId: subscription.productIdentifier,
            },
          ]
        : [],
  );
  return [...subscriptions, ...oneOff];
}

function errorCode(error: unknown): string {
  const code = (error as Partial<PurchasesError> | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

function toProduct(product: PurchasesStoreProduct): StoreProduct {
  return {
    id: product.identifier,
    title: product.title,
    priceString: product.priceString,
    price: product.price,
    currencyCode: product.currencyCode,
    subscriptionPeriod: product.subscriptionPeriod ?? null,
  };
}

let configuredFor: string | null = null;

/**
 * Configures RevenueCat for the signed-in uid (once per process; a later uid logs in) and returns
 * the store port, or `null` when this build has no key or runs where there is no store.
 */
export function createRevenueCatStore(uid: string): StorePort | null {
  const platform = storePlatform();
  if (platform === null) return null;
  const apiKey = revenueCatKey(platform);
  if (apiKey === null) return null;
  if (configuredFor === null) {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: uid });
    configuredFor = uid;
  }
  const productsById = new Map<string, PurchasesStoreProduct>();
  const loadProducts = async (ids: readonly string[]): Promise<StoreProduct[]> => {
    // Play lists subscriptions and one-off products separately; App Store answers both either way.
    const [subscriptions, oneOff] = await Promise.all([
      Purchases.getProducts([...ids], PRODUCT_CATEGORY.SUBSCRIPTION),
      Purchases.getProducts([...ids], PRODUCT_CATEGORY.NON_SUBSCRIPTION),
    ]);
    for (const product of [...subscriptions, ...oneOff]) {
      productsById.set(product.identifier, product);
    }
    return ids.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [toProduct(product)] : [];
    });
  };

  return {
    platform,
    async logIn(next) {
      if (configuredFor === next) return;
      await Purchases.logIn(next);
      configuredFor = next;
    },
    products: loadProducts,
    async purchase(productId) {
      if (!productsById.has(productId)) await loadProducts([productId]);
      const product = productsById.get(productId);
      if (!product) return { kind: 'failed', code: 'product_unavailable' };
      try {
        const result = await Purchases.purchaseStoreProduct(product);
        return {
          kind: 'success',
          transactionId: result.transaction.transactionIdentifier,
          productId: result.productIdentifier,
        };
      } catch (error) {
        if ((error as Partial<PurchasesError>).userCancelled) return { kind: 'cancelled' };
        const code = errorCode(error);
        if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { kind: 'cancelled' };
        if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { kind: 'pending' };
        return { kind: 'failed', code };
      }
    },
    async restore() {
      try {
        return {
          kind: 'restored',
          transactions: transactionsOf(await Purchases.restorePurchases()),
        };
      } catch (error) {
        const code = errorCode(error);
        if (code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR)
          return { kind: 'other_account' };
        return { kind: 'failed', code };
      }
    },
    async setAttributes(attributes) {
      await Purchases.setAttributes({ ...attributes });
    },
    onTransactions(listener) {
      const handler = (info: CustomerInfo) => listener(transactionsOf(info));
      Purchases.addCustomerInfoUpdateListener(handler);
      return () => {
        Purchases.removeCustomerInfoUpdateListener(handler);
      };
    },
    async showManageSubscriptions() {
      await Purchases.showManageSubscriptions();
    },
  };
}
