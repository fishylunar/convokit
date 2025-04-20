import { ConvoKitProviderConstructor, ConvoKitProviderInfo } from '../index';

/**
 * Registry entry for a provider.
 */
export interface ProviderRegistryEntry {
  id: string;
  ctor: ConvoKitProviderConstructor;
  info: ConvoKitProviderInfo;
}

/**
 * Registry for all available ConvoKit providers.
 */
export class ProviderRegistry {
  private static registry = new Map<string, ProviderRegistryEntry>();

  /**
   * Registers a provider with a unique ID.
   * @param id Unique provider identifier.
   * @param ctor Provider constructor.
   * @param info Provider metadata.
   */
  static register(id: string, ctor: ConvoKitProviderConstructor, info: ConvoKitProviderInfo): void {
    if (ProviderRegistry.registry.has(id)) {
      throw new Error(`Provider with id "${id}" is already registered.`);
    }
    ProviderRegistry.registry.set(id, { id, ctor, info });
  }

  /**
   * Retrieves a registered provider entry by ID.
   */
  static get(id: string): ProviderRegistryEntry | undefined {
    return ProviderRegistry.registry.get(id);
  }

  /**
   * Lists all registered provider entries.
   */
  static list(): ProviderRegistryEntry[] {
    return Array.from(ProviderRegistry.registry.values());
  }

  /**
   * Finds the registered ID for a given provider constructor.
   * @param ctor The provider constructor to find the ID for.
   * @returns The ID if found, otherwise undefined.
   */
  static findIdByConstructor(ctor: ConvoKitProviderConstructor): string | undefined {
    for (const [id, entry] of this.registry.entries()) {
      if (entry.ctor === ctor) {
        return id;
      }
    }
    return undefined;
  }
}
