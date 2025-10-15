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
} from 'lucide-react';
import { TextInput } from '../ui/text-input';

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
  const [selectedDebrid, setSelectedDebrid] = useState<string>('');
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

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
        setTemplates(data.data || []);
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

  const handleLoadTemplate = (template: ConfigTemplate) => {
    setPendingTemplate(template);
    setShowDebridModal(true);
  };

  const proceedToApiKeys = () => {
    if (!pendingTemplate || !selectedDebrid) {
      toast.error('Please select a debrid service');
      return;
    }

    // Extract required API keys from template
    const requiredKeys: Record<string, string> = {};
    
    if (pendingTemplate.config) {
      // Add debrid service API key
      const serviceMeta = status?.settings.services?.[selectedDebrid as keyof typeof status.settings.services];
      if (serviceMeta?.credentials) {
        serviceMeta.credentials.forEach((cred) => {
          requiredKeys[`service_${selectedDebrid}_${cred.id}`] = cred.name || cred.id;
        });
      }

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
    if (!pendingTemplate || !selectedDebrid) {
      return;
    }

    setIsLoading(true);
    try {
      if (pendingTemplate.config) {
        // Load from template config
        const migratedData = applyMigrations(pendingTemplate.config);

        // Update the services to use the selected debrid service and apply API keys
        const updatedServices = migratedData.services
          ?.filter((service: any) => service.id === selectedDebrid)
          .map((service: any) => {
            const newCredentials = { ...service.credentials };
            
            // Apply API keys from the apiKeys state
            Object.keys(apiKeys).forEach((apiKeyKey) => {
              if (apiKeyKey.startsWith(`service_${selectedDebrid}_`)) {
                const credKey = apiKeyKey.split('_').slice(2).join('_');
                if (apiKeys[apiKeyKey]) {
                  newCredentials[credKey] = apiKeys[apiKeyKey];
                }
              }
            });
            
            return { ...service, credentials: newCredentials };
          }) || [];

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
      setSelectedDebrid('');
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
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Left side - Main info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white mb-2">
                      {template.name}
                    </h3>
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
            ))
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
            setSelectedDebrid('');
          }
        }}
        title="Select Debrid Service"
        description="Choose which debrid service you want to use with this template"
      >
        <div className="space-y-4">
          <Alert
            intent="info"
            description="Select the debrid service you have an account with. You'll be prompted to enter your API keys in the next step."
          />

          <div className="space-y-2">
            {Object.entries(status?.settings.services || {}).map(([id, service]: [string, any]) => (
              <button
                key={id}
                onClick={() => setSelectedDebrid(id)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                  selectedDebrid === id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <div className="font-semibold text-white">{service.name}</div>
                <div className="text-sm text-gray-400">{service.description || 'Premium debrid service'}</div>
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              intent="primary-outline"
              onClick={() => {
                setShowDebridModal(false);
                setPendingTemplate(null);
                setSelectedDebrid('');
              }}
            >
              Cancel
            </Button>
            <Button
              intent="white"
              rounded
              onClick={proceedToApiKeys}
              disabled={!selectedDebrid}
            >
              Next
            </Button>
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
            setSelectedDebrid('');
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
                const serviceMeta = status?.settings.services?.[selectedDebrid as keyof typeof status.settings.services];
                const credKey = key.split('_').slice(2).join('_');
                const credential = serviceMeta?.credentials?.find(c => c.id === credKey);
                label = credential?.name || credKey;
                label = `${serviceMeta?.name || selectedDebrid} - ${label}`;
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
    </Modal>
  );
}
