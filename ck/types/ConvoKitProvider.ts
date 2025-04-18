/* eslint-disable no-unused-vars */

import { ConvoKitConversation } from "./ConvoKitTypes";

/**
 * Configuration details for provider input data directories and file formats.
 */
export interface ConvoKitProviderInputDataInfo {
    fileExtension: string;
    directoryName: string;
}

/**
 * Metadata about a ConvoKit provider, including name, version, and input data info.
 */
export interface ConvoKitProviderInfo {
    name: string;
    description: string;
    version: string;
    author: string;
    InputDataInfo: ConvoKitProviderInputDataInfo;
}

/**
 * Core interface that each provider must implement to parse and convert data.
 */
export interface ConvoKitProvider {
    /**
     * Static provider metadata.
     */
    ProviderInfo: ConvoKitProviderInfo;
    /**
     * Raw data input for the provider.
     */
    Data: any;
    /**
     * Tests whether the provided data is compatible with this provider.
     * @returns true if data is valid and can be converted.
     */
    Test: () => boolean;
    /**
     * Converts the raw data to standard ConvoKitConversation format.
     * @returns a normalized conversation object.
     */
    Convert: () => ConvoKitConversation;
}

/**
 * Constructor signature for a ConvoKit provider class.
 */
export type ConvoKitProviderConstructor = new (data: any) => ConvoKitProvider;
