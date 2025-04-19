import { PluginRegistry, type FilterPluginClass } from '../..';

export class LinkOnlyFilter implements FilterPluginClass {
  PluginInfo = {
    id: 'link-only',
    name: 'Link Only Message Filter',
    description: 'Filters out messages that contain only a URL',
    version: '1.0.0',
    type: 'filter' as const
  };
  filterType = 'MUST_NOT' as const;

  apply(content: string): boolean {
    const trimmed = content.trim();
    const urlPattern = /^(https?:\/\/[^\s]+)$/;
    return urlPattern.test(trimmed);
  }
}

// Self-register
PluginRegistry.registerFilter(LinkOnlyFilter);