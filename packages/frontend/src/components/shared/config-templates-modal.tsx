'use client';
import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import { toast } from 'sonner';
import { applyMigrations, useUserData } from '@/context/userData';
import { useStatus } from '@/context/status';
import {
  SearchIcon,
  CheckIcon,
  AlertTriangleIcon,
  UploadIcon,
} from 'lucide-react';
import { TextInput } from '../ui/text-input';
import { Textarea } from '../ui/textarea';

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  addons: string[];
  debridServices: string[];
  featured?: boolean;
  url?: string;
  config?: any;
}

export interface TemplateValidation {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ConfigTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigTemplatesModal({
  open,
  onOpenChange,
}: ConfigTemplatesModalProps) {
  const { setUserData } = useUserData();
  const { status } = useStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [showDebridModal, setShowDebridModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<ConfigTemplate | null>(null);
  const [selectedDebrids, setSelectedDebrids] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [templateValidations, setTemplateValidations] = useState<Record<string, TemplateValidation>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Fetch templates from API when modal opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch('/api/v1/templates');
      if (response.ok) {
        const data = await response.json();
        const fetchedTemplates = data.data || [];
        setTemplates(fetchedTemplates);

        // Validate all templates
        if (status) {
          const validations: Record<string, TemplateValidation> = {};
          fetchedTemplates.forEach((template: ConfigTemplate) => {
            validations[template.id] = validateTemplate(template, status);
          });
          setTemplateValidations(validations);
        }
      } else {
        toast.error('Failed to load templates');
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const validateTemplate = (template: ConfigTemplate, statusData: any): TemplateValidation => {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if template has required structure
    if (!template.config) {
      errors.push('Template is missing configuration data');
      return { isValid: false, warnings, errors };
    }

    // Check if addons exist on instance
    const availableAddons = statusData.settings?.presets?.map((p: any) => p.NAME) || [];
    if (template.config.presets) {
      template.config.presets.forEach((preset: any) => {
        const presetMeta = statusData.settings?.presets?.find((p: any) => p.ID === preset.type);
        if (!presetMeta) {
          warnings.push(`Addon type "${preset.type}" not available on this instance`);
        }
      });
    }

    // Check if services exist on instance
    const availableServices = Object.keys(statusData.settings?.services || {});
    if (template.config.services) {
      template.config.services.forEach((service: any) => {
        if (!availableServices.includes(service.id)) {
          warnings.push(`Service "${service.id}" not available on this instance`);
        }
      });
    }

    // Check regex patterns against allowed patterns
    const excludedRegexes = template.config.excludedRegexPatterns || [];
    const includedRegexes = template.config.includedRegexPatterns || [];
    const requiredRegexes = template.config.requiredRegexPatterns || [];
    const preferredRegexes = (template.config.preferredRegexPatterns || []).map((r: any) =>
      typeof r === 'string' ? r : r.pattern
    );

    const allRegexes = [
      ...excludedRegexes,
      ...includedRegexes,
      ...requiredRegexes,
      ...preferredRegexes,
    ];

    if (allRegexes.length > 0) {
      // Get allowed patterns from status
      const allowedPatterns = statusData.settings?.allowedRegexPatterns?.patterns || [];

      // Check if regex access is restricted
      if (statusData.settings?.regexFilterAccess === 'none' && allowedPatterns.length === 0) {
        warnings.push('Template uses regex patterns but regex access is disabled on this instance');
      } else if (statusData.settings?.regexFilterAccess === 'trusted' && !template.config.trusted) {
        warnings.push('Template uses regex patterns which require trusted user status');
      } else if (allowedPatterns.length > 0) {
        // Check if all patterns are allowed (exact match)
        const unsupportedPatterns = allRegexes.filter(pattern => !allowedPatterns.includes(pattern));

        if (unsupportedPatterns.length > 0) {
          const patternList = unsupportedPatterns.slice(0, 3).join(', ');
          warnings.push(`Template has ${unsupportedPatterns.length} unsupported regex pattern${unsupportedPatterns.length > 1 ? 's' : ''}: ${patternList}${unsupportedPatterns.length > 3 ? '...' : ''}`);
        }
      }
    }

    const isValid = errors.length === 0;
    return { isValid, warnings, errors };
  };

  const categories = ['all', ...Array.from(new Set(templates.map(t => t.category)))];

  const filteredTemplates = templates.filter(template => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.addons.some(addon => addon.toLowerCase().includes(searchQuery.toLowerCase())) ||
      template.debridServices.some(service => service.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJson);

      // Validate it has a config field
      if (!parsed.config) {
        toast.error('Invalid template: missing config field');
        return;
      }

      // Create a template object from the JSON
      const importedTemplate: ConfigTemplate = {
        id: `imported-${Date.now()}`,
        name: parsed.metadata?.name || parsed.config?.addonName || 'Imported Template',
        description: parsed.metadata?.description || parsed.config?.addonDescription || 'Imported from JSON',
        author: parsed.metadata?.author || 'Unknown',
        category: parsed.metadata?.category || 'Custom',
        addons: parsed.metadata?.addons || [],
        debridServices: parsed.metadata?.debridServices || [],
        config: parsed.config || parsed,
      };

      // Validate the imported template
      if (status) {
        const validation = validateTemplate(importedTemplate, status);
        setTemplateValidations(prev => ({ ...prev, [importedTemplate.id]: validation }));

        if (validation.errors.length > 0) {
          toast.error(`Cannot load template: ${validation.errors.join(', ')}`);
          return;
        }
      }

      // Close import modal and load the template directly
      setShowImportModal(false);
      setImportJson('');

      // Load the template directly (will trigger debrid and API key modals)
      handleLoadTemplate(importedTemplate);
    } catch (error) {
      toast.error('Invalid JSON: ' + (error as Error).message);
    }
  };

  const handleLoadTemplate = (template: ConfigTemplate) => {
    // Show validation warnings if any
    const validation = templateValidations[template.id];
    if (validation && validation.errors.length > 0) {
      toast.error(`Cannot load template: ${validation.errors.join(', ')}`);
      return;
    }

    if (validation && validation.warnings.length > 0) {
      toast.warning(`Template has warnings: ${validation.warnings.slice(0, 2).join(', ')}${validation.warnings.length > 2 ? '...' : ''}`, {
        duration: 5000,
      });
    }

    setPendingTemplate(template);

    // Check if template has any debrid services configured
    const hasDebridServices = template.config?.services?.some((s: any) =>
      Object.keys(status?.settings?.services || {}).includes(s.id)
    );

    if (!hasDebridServices) {
      // Skip debrid selection for non-debrid templates
      setSelectedDebrids([]);
      proceedToApiKeys();
    } else {
      setShowDebridModal(true);
    }
  };

  const proceedToApiKeys = () => {
    if (!pendingTemplate) {
      return;
    }

    // Check if at least one debrid is selected if template has debrid services
    const hasDebridServices = pendingTemplate.config?.services?.some((s: any) =>
      Object.keys(status?.settings?.services || {}).includes(s.id)
    );

    if (hasDebridServices && selectedDebrids.length === 0) {
      toast.error('Please select at least one debrid service or skip if not needed');
      return;
    }

    // Extract required API keys from template
    const requiredKeys: Record<string, string> = {};

    if (pendingTemplate.config) {
      // Add debrid service API keys for all selected services
      selectedDebrids.forEach((selectedDebrid) => {
        const serviceMeta = status?.settings.services?.[selectedDebrid as keyof typeof status.settings.services];
        if (serviceMeta?.credentials) {
          serviceMeta.credentials.forEach((cred) => {
            requiredKeys[`service_${selectedDebrid}_${cred.id}`] = `${serviceMeta.name} - ${cred.name || cred.id}`;
          });
        }
      });

      // Check top-level config fields for API keys
      const topLevelApiFields = ['tmdbAccessToken', 'tmdbApiKey', 'rpdbApiKey', 'tvdbApiKey'];
      topLevelApiFields.forEach((field) => {
        const value = pendingTemplate.config[field];
        if (!value || value === '<ENTER_YOUR_API_KEY>' || value === '') {
          const fieldNames: Record<string, string> = {
            tmdbAccessToken: 'TMDB Access Token',
            tmdbApiKey: 'TMDB API Key',
            rpdbApiKey: 'RPDB API Key',
            tvdbApiKey: 'TVDB API Key',
          };
          requiredKeys[`config_${field}`] = fieldNames[field] || field;
        }
      });

      // Find API keys in presets
      pendingTemplate.config.presets?.forEach((preset: any) => {
        const presetMeta = status?.settings.presets.find((p) => p.ID === preset.type);

        // Check all password-type options from the preset metadata
        presetMeta?.OPTIONS?.forEach((option) => {
          if (option.type === 'password') {
            // Check if the option value is a placeholder or empty
            const currentValue = preset.options?.[option.id];
            if (!currentValue || currentValue === '<ENTER_YOUR_API_KEY>' || currentValue === '') {
              requiredKeys[`preset_${preset.instanceId}_${option.id}`] = `${preset.options?.name || preset.type} - ${option.name || option.id}`;
            }
          }
        });
      });
    }

    setApiKeys(Object.keys(requiredKeys).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
    setShowDebridModal(false);
    setShowApiKeyModal(true);
  };

  const confirmLoadTemplate = async () => {
    if (!pendingTemplate) {
      return;
    }

    setIsLoading(true);
    try {
      if (pendingTemplate.config) {
        // Load from template config
        const migratedData = applyMigrations(pendingTemplate.config);

        // Update the services to use the selected debrid services and apply API keys
        const updatedServices = selectedDebrids.length > 0
          ? migratedData.services
              ?.filter((service: any) => selectedDebrids.includes(service.id))
              .map((service: any) => {
                const newCredentials = { ...service.credentials };

                // Apply API keys from the apiKeys state
                Object.keys(apiKeys).forEach((apiKeyKey) => {
                  if (apiKeyKey.startsWith(`service_${service.id}_`)) {
                    const credKey = apiKeyKey.split('_').slice(2).join('_');
                    if (apiKeys[apiKeyKey]) {
                      newCredentials[credKey] = apiKeys[apiKeyKey];
                    }
                  }
                });

                return { ...service, enabled: true, credentials: newCredentials };
              }) || []
          : [];

        // Update presets with API keys
        const updatedPresets = migratedData.presets?.map((preset: any) => {
          const newOptions = { ...preset.options };
          
          // Update existing options with API keys
          Object.keys(preset.options || {}).forEach((key) => {
            const apiKeyKey = `preset_${preset.instanceId}_${key}`;
            if (apiKeys[apiKeyKey]) {
              newOptions[key] = apiKeys[apiKeyKey];
            }
          });
          
          // Add API keys for options that might not exist in the preset
          Object.keys(apiKeys).forEach((apiKeyKey) => {
            if (apiKeyKey.startsWith(`preset_${preset.instanceId}_`)) {
              const optionKey = apiKeyKey.split('_').slice(2).join('_');
              if (apiKeys[apiKeyKey]) {
                newOptions[optionKey] = apiKeys[apiKeyKey];
              }
            }
          });
          
          return { ...preset, options: newOptions };
        }) || [];

        // Apply top-level API keys
        Object.keys(apiKeys).forEach((apiKeyKey) => {
          if (apiKeyKey.startsWith('config_')) {
            const fieldName = apiKeyKey.split('_')[1];
            if (apiKeys[apiKeyKey]) {
              (migratedData as any)[fieldName] = apiKeys[apiKeyKey];
            }
          }
        });

        const updatedData = {
          ...migratedData,
          services: updatedServices,
          presets: updatedPresets,
        };

        setUserData((prev) => ({
          ...prev,
          ...updatedData,
        }));
        
        // Check if there are any addons that need manual setup
        const addonsNeedingSetup = updatedPresets
          .filter((preset: any) => {
            const presetType = preset.type.toLowerCase();
            // List of addons that need manual setup
            return ['gdrive', 'aiometadata', 'oauth'].some(type => presetType.includes(type));
          })
          .map((preset: any) => preset.options?.name || preset.type);
        
        toast.success(`Template "${pendingTemplate.name}" loaded successfully`);
        
        // Show additional guidance if needed
        if (addonsNeedingSetup.length > 0) {
          setTimeout(() => {
            toast.info(
              `Note: ${addonsNeedingSetup.join(', ')} require additional setup. Please configure them in the Addons section.`,
              { duration: 8000 }
            );
          }, 1000);
        }
        
        setShowApiKeyModal(false);
        onOpenChange(false);
      } else {
        toast.error('Template configuration not available');
      }
    } catch (err) {
      console.error('Error loading template:', err);
      toast.error('Failed to load template');
    } finally {
      setIsLoading(false);
      setPendingTemplate(null);
      setSelectedDebrids([]);
      setApiKeys({});
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Config Templates"
      description="Browse and load pre-configured templates for your AIOStreams setup"
    >
      <div className="space-y-4">
        <Alert
          intent="info"
          description="Templates are pre-configured setups that include addon selections and settings. You'll be guided through entering your API keys during the loading process. Some addons (like Google Drive, AIO Metadata) may require additional manual setup after loading."
        />

        {/* Import JSON Button */}
        <div className="flex justify-end">
          <Button
            intent="primary-outline"
            size="sm"
            leftIcon={<UploadIcon className="w-4 h-4" />}
            onClick={() => setShowImportModal(true)}
          >
            Import JSON
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <TextInput
              placeholder="Search templates..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              leftIcon={<SearchIcon className="w-4 h-4" />}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((category) => (
              <Button
                key={category}
                intent={selectedCategory === category ? 'primary' : 'gray-outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap"
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
          {loadingTemplates ? (
            <div className="text-center py-8 text-gray-400">
              Loading templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No templates found matching your search
            </div>
          ) : (
            filteredTemplates.map((template) => {
              const validation = templateValidations[template.id];
              const hasWarnings = validation && validation.warnings.length > 0;
              const hasErrors = validation && validation.errors.length > 0;

              return (
              <div
                key={template.id}
                className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Left side - Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-semibold text-white">
                        {template.name}
                      </h3>
                      {(hasWarnings || hasErrors) && (
                        <div className="relative group">
                          <AlertTriangleIcon className={`w-4 h-4 ${hasErrors ? 'text-red-400' : 'text-yellow-400'}`} />
                          <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-xs">
                            {validation.errors.length > 0 && (
                              <div className="mb-2">
                                <div className="font-semibold text-red-400 mb-1">Errors:</div>
                                <ul className="list-disc list-inside space-y-1 text-red-300">
                                  {validation.errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {validation.warnings.length > 0 && (
                              <div>
                                <div className="font-semibold text-yellow-400 mb-1">Warnings:</div>
                                <ul className="list-disc list-inside space-y-1 text-yellow-300">
                                  {validation.warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      {template.description}
                    </p>

                    {/* Category and Author */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs mb-1.5">Category</div>
                        <span className="text-xs bg-gray-800/60 text-gray-300 px-2 py-1 rounded inline-block">
                          {template.category}
                        </span>
                      </div>

                      <div>
                        <div className="text-gray-500 text-xs mb-1.5">Author</div>
                        <span className="text-xs text-gray-300">{template.author}</span>
                      </div>
                    </div>

                    {/* Addons */}
                    {template.addons.length > 0 && (
                      <div className="mt-3">
                        <div className="text-gray-500 text-xs mb-1.5">Addons</div>
                        <div className="flex flex-wrap gap-1.5">
                          {template.addons.map((addon) => (
                            <span
                              key={addon}
                              className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded"
                            >
                              {addon}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Debrids */}
                    {template.debridServices.length > 0 && (
                      <div className="mt-3">
                        <div className="text-gray-500 text-xs mb-1.5">Debrids</div>
                        <div className="flex flex-wrap gap-1.5">
                          {template.debridServices.map((service) => (
                            <span
                              key={service}
                              className="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded"
                            >
                              {service}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right side - Action button */}
                  <div className="flex items-center">
                    <Button
                      intent="primary"
                      size="sm"
                      leftIcon={<CheckIcon className="w-4 h-4" />}
                      onClick={() => handleLoadTemplate(template)}
                      loading={isLoading}
                    >
                      Load Template
                    </Button>
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
          </div>
          <Button intent="primary-outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>

      {/* Debrid Selection Modal */}
      <Modal
        open={showDebridModal}
        onOpenChange={(isOpen) => {
          setShowDebridModal(isOpen);
          if (!isOpen) {
            setPendingTemplate(null);
            setSelectedDebrids([]);
          }
        }}
        title="Select Debrid Services"
        description="Choose which debrid services you want to use with this template"
      >
        <div className="space-y-4">
          <Alert
            intent="info"
            description="Select the debrid services you have accounts with. You can select multiple services or skip this step if the template doesn't require debrid services."
          />

          <div className="space-y-2">
            {Object.entries(status?.settings.services || {}).map(([id, service]: [string, any]) => {
              const isSelected = selectedDebrids.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => {
                    setSelectedDebrids(prev =>
                      prev.includes(id)
                        ? prev.filter(s => s !== id)
                        : [...prev, id]
                    );
                  }}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-white">{service.name}</div>
                      <div className="text-sm text-gray-400">{service.description || 'Premium debrid service'}</div>
                    </div>
                    {isSelected && (
                      <CheckIcon className="w-5 h-5 text-purple-400 flex-shrink-0 ml-2" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button
              intent="primary-outline"
              onClick={() => {
                setShowDebridModal(false);
                setPendingTemplate(null);
                setSelectedDebrids([]);
              }}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                intent="gray-outline"
                onClick={() => {
                  setSelectedDebrids([]);
                  proceedToApiKeys();
                }}
              >
                Skip
              </Button>
              <Button
                intent="white"
                rounded
                onClick={proceedToApiKeys}
                disabled={selectedDebrids.length === 0}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* API Keys Modal */}
      <Modal
        open={showApiKeyModal}
        onOpenChange={(isOpen) => {
          setShowApiKeyModal(isOpen);
          if (!isOpen) {
            setPendingTemplate(null);
            setSelectedDebrids([]);
            setApiKeys({});
          }
        }}
        title="Enter API Keys"
        description="Provide your API keys for the selected services and addons"
      >
        <div className="space-y-4">
          <Alert
            intent="info"
            description="Enter your API keys below. These will be securely stored in your configuration. Note: Some addons (Google Drive, AIO Metadata, etc.) require OAuth or additional setup - configure these in the Addons section after loading."
          />

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {Object.entries(apiKeys).map(([key, value]) => {
              // Extract label from the key
              let label = key;
              if (key.startsWith('service_')) {
                const serviceId = key.split('_')[1];
                const serviceMeta = status?.settings.services?.[serviceId as keyof typeof status.settings.services];
                const credKey = key.split('_').slice(2).join('_');
                const credential = serviceMeta?.credentials?.find((c: any) => c.id === credKey);
                label = credential?.name || credKey;
                label = `${serviceMeta?.name || serviceId} - ${label}`;
              } else if (key.startsWith('config_')) {
                const fieldName = key.split('_')[1];
                const fieldNames: Record<string, string> = {
                  tmdbAccessToken: 'TMDB Access Token',
                  tmdbApiKey: 'TMDB API Key',
                  rpdbApiKey: 'RPDB API Key',
                  tvdbApiKey: 'TVDB API Key',
                };
                label = fieldNames[fieldName] || fieldName;
              } else if (key.startsWith('preset_')) {
                const parts = key.split('_');
                const instanceId = parts[1];
                const optionKey = parts.slice(2).join('_');
                const preset = pendingTemplate?.config?.presets?.find((p: any) => p.instanceId === instanceId);
                if (preset) {
                  const presetMeta = status?.settings.presets.find((p) => p.ID === preset.type);
                  const optionMeta = presetMeta?.OPTIONS?.find((opt) => opt.id === optionKey);
                  label = `${preset.options?.name || preset.type} - ${optionMeta?.name || optionKey}`;
                }
              }

              return (
                <TextInput
                  key={key}
                  label={label}
                  type="password"
                  placeholder="Enter API key..."
                  value={value}
                  onValueChange={(newValue) => {
                    setApiKeys((prev) => ({ ...prev, [key]: newValue }));
                  }}
                  required
                />
              );
            })}

            {Object.keys(apiKeys).length === 0 && (
              <div className="text-center py-4 text-gray-400 text-sm">
                No API keys required for this template
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              intent="primary-outline"
              onClick={() => {
                setShowApiKeyModal(false);
                setShowDebridModal(true);
              }}
            >
              Back
            </Button>
            <Button
              intent="white"
              rounded
              onClick={confirmLoadTemplate}
              loading={isLoading}
              disabled={Object.keys(apiKeys).length > 0 && Object.values(apiKeys).some(v => !v.trim())}
            >
              Load Template
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import JSON Modal */}
      <Modal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        title="Import Template from JSON"
        description="Paste your template JSON below"
      >
        <div className="space-y-4">
          <Alert
            intent="info"
            description="Paste the complete template JSON configuration below. The template will be validated and loaded directly."
          />

          <Textarea
            label="Template JSON"
            value={importJson}
            onValueChange={setImportJson}
            placeholder='{"config": {...}, "metadata": {...}}'
            rows={12}
            className="font-mono text-sm"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              intent="primary-outline"
              onClick={() => {
                setShowImportModal(false);
                setImportJson('');
              }}
            >
              Cancel
            </Button>
            <Button
              intent="white"
              rounded
              onClick={handleImportJson}
              disabled={!importJson.trim()}
            >
              Load Template
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
