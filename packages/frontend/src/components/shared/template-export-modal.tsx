'use client';
import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import { toast } from 'sonner';
import { UserData } from '@aiostreams/core';
import { useStatus } from '@/context/status';
import { TextInput } from '../ui/text-input';
import { Textarea } from '../ui/textarea';

export interface TemplateExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userData: UserData;
}

export function TemplateExportModal({
  open,
  onOpenChange,
  userData,
}: TemplateExportModalProps) {
  const { status } = useStatus();
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Debrid');

  useEffect(() => {
    if (open) {
      // Reset fields when modal opens
      setTemplateName('');
      setDescription('');
      setAuthor('');
      setCategory('Debrid');
    }
  }, [open]);

  const handleExport = () => {
    // Validate required fields
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (!author.trim()) {
      toast.error('Please enter an author name');
      return;
    }

    try {
      // Create a copy of userData with credentials removed
      const templateData: UserData = {
        ...userData,
        uuid: undefined,
        addonPassword: undefined,
        ip: undefined,
        tmdbAccessToken: undefined,
        tmdbApiKey: undefined,
        tvdbApiKey: undefined,
        rpdbApiKey: undefined,
        services: userData.services?.map((service) => {
          const newCredentials: Record<string, string> = {};

          // Replace all credentials with placeholder
          Object.keys(service.credentials || {}).forEach((key) => {
            newCredentials[key] = '<ENTER_YOUR_API_KEY>';
          });

          return {
            ...service,
            credentials: newCredentials,
          };
        }),
        presets: userData.presets?.map((preset) => {
          const newOptions = { ...preset.options };

          // Find password options and replace with placeholder
          const presetMetadata = status?.settings.presets.find(
            (p) => p.ID === preset.type
          );
          presetMetadata?.OPTIONS?.filter((opt) => opt.type === 'password').forEach(
            (passwordOption) => {
              newOptions[passwordOption.id] = '<ENTER_YOUR_API_KEY>';
            }
          );

          return {
            ...preset,
            options: newOptions,
          };
        }),
        proxy: {
          ...userData.proxy,
          credentials: undefined,
          url: undefined,
          publicUrl: undefined,
        },
      };

      // Get addon names and debrid service names for metadata (only enabled ones)
      const addonNames = userData.presets
        ?.filter((preset) => preset.enabled)
        .map((preset) => {
          const presetMeta = status?.settings.presets.find((p) => p.ID === preset.type);
          return presetMeta?.NAME || preset.type;
        }) || [];

      const debridServices = userData.services
        ?.filter((service) => service.enabled)
        .map((service) => {
          const serviceMeta = status?.settings.services?.[service.id];
          return serviceMeta?.name || service.id;
        }) || [];

      // Create template with metadata
      const template = {
        metadata: {
          name: templateName,
          description: description,
          author: author,
          category: category,
          addons: addonNames,
          debridServices: debridServices,
          createdAt: new Date().toISOString(),
        },
        config: templateData,
      };

      const dataStr = JSON.stringify(template, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateName.toLowerCase().replace(/\s+/g, '-')}-template.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Template exported successfully');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to export template');
    }
  };

  const categories = ['Debrid', 'P2P'] as const;

  // Get addon names and debrid service names for display (only enabled ones)
  const addonNames = userData.presets
    ?.filter((preset) => preset.enabled)
    .map((preset) => {
      const presetMeta = status?.settings.presets.find((p) => p.ID === preset.type);
      return presetMeta?.NAME || preset.type;
    }) || [];

  const debridServices = userData.services
    ?.filter((service) => service.enabled)
    .map((service) => {
      const serviceMeta = status?.settings.services?.[service.id];
      return serviceMeta?.name || service.id;
    }) || [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Export as Template"
      description="Configure your template metadata and settings"
    >
      <div className="space-y-4">
        <Alert
          intent="info"
          description="A template is a configuration file that others can use as a starting point. All personal credentials will be replaced with placeholders."
        />

        <div className="space-y-3">
          <TextInput
            label="Template Name"
            placeholder="e.g., TorBox Premium Setup"
            value={templateName}
            onValueChange={setTemplateName}
            required
          />

          <Textarea
            label="Description"
            placeholder="Describe what makes this template useful..."
            value={description}
            onValueChange={setDescription}
            required
            rows={3}
          />

          <TextInput
            label="Author"
            placeholder="Your name or username"
            value={author}
            onValueChange={setAuthor}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Category
            </label>
            <div className="flex gap-2">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  intent={category === cat ? 'primary' : 'gray-outline'}
                  size="sm"
                  onClick={() => setCategory(cat)}
                  type="button"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Features
            </label>
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              {addonNames.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Addons</div>
                  <div className="flex flex-wrap gap-1.5">
                    {addonNames.map((addon, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded"
                      >
                        {addon}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {debridServices.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Debrid Services</div>
                  <div className="flex flex-wrap gap-1.5">
                    {debridServices.map((service, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {addonNames.length === 0 && debridServices.length === 0 && (
                <p className="text-sm text-gray-400">No features configured yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
          <Button intent="primary-outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button intent="white" rounded onClick={handleExport}>
            Export Template
          </Button>
        </div>
      </div>
    </Modal>
  );
}
