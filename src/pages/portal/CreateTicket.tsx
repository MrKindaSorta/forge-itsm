import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserMultiSelect } from '@/components/ui/user-multi-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, FileText, AlertCircle, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { FormConfiguration, FormField } from '@/types/formBuilder';
import type { User, TicketPriority } from '@/types';
import { getPriorityColor } from '@/lib/utils';
import { getVisibleFieldsInHierarchicalOrder, getFieldsToHide } from '@/utils/conditionalFieldEvaluator';

const FORM_CONFIG_STORAGE_KEY = 'itsm-form-configuration';
const API_BASE = 'https://itsm-backend.joshua-r-klimek.workers.dev';

interface Article {
  id: number;
  title: string;
  content: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  tags: string[];
  views: number;
}

export default function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);

  // All form fields (system + custom) in order
  const [allFields, setAllFields] = useState<FormField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // Users for CC field
  const [users, setUsers] = useState<User[]>([]);
  const [ccUserIds, setCcUserIds] = useState<string[]>([]);

  // Articles for suggestions
  const [articles, setArticles] = useState<Article[]>([]);

  // Load form configuration from API (fallback to localStorage)
  useEffect(() => {
    const loadFormConfig = async () => {
      let fields: FormField[] = [];

      try {
        // Try loading from API first
        const response = await fetch(`${API_BASE}/api/config/form`);
        const data = await response.json();

        if (data.success && data.config.fields) {
          fields = data.config.fields;
          // Cache in localStorage
          localStorage.setItem(FORM_CONFIG_STORAGE_KEY, JSON.stringify(data.config));
        } else {
          throw new Error('No fields in API response');
        }
      } catch (error) {
        console.error('Failed to load form configuration from API, using localStorage:', error);

        // Fallback to localStorage
        const saved = localStorage.getItem(FORM_CONFIG_STORAGE_KEY);
        if (saved) {
          try {
            const config: FormConfiguration = JSON.parse(saved);
            fields = config.fields || [];
          } catch (parseError) {
            console.error('Failed to parse localStorage config:', parseError);
          }
        }
      }

      // Sort all fields by order property
      const sortedFields = fields.sort((a, b) => (a.order || 0) - (b.order || 0));
      setAllFields(sortedFields);

      // Initialize field values with default values
      const initialValues: Record<string, any> = {};
      sortedFields.forEach(field => {
        if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
          // For multiselect, ensure default value is an array
          if (field.type === 'multiselect') {
            initialValues[field.id] = Array.isArray(field.defaultValue) ? field.defaultValue : [];
          } else {
            initialValues[field.id] = field.defaultValue;
          }
        } else {
          // Initialize with appropriate empty values
          if (field.type === 'multiselect') {
            initialValues[field.id] = [];
          } else if (field.type === 'checkbox') {
            initialValues[field.id] = false;
          } else {
            initialValues[field.id] = '';
          }
        }
      });
      setFieldValues(initialValues);
    };

    loadFormConfig();
  }, []);

  // Fetch users if CC field exists in configuration
  useEffect(() => {
    const hasCCField = allFields.some(field => field.type === 'cc_users');
    if (hasCCField) {
      fetchUsers();
    }
  }, [allFields]);

  // Fetch articles for suggestions when title or description changes
  useEffect(() => {
    const title = fieldValues['system-title'] || '';
    const description = fieldValues['system-description'] || '';
    const combinedText = `${title} ${description}`.trim();

    if (combinedText.length < 3) {
      setArticles([]);
      return;
    }

    const fetchArticles = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/articles/search-suggestions?query=${encodeURIComponent(combinedText)}`);
        const data = await response.json();
        if (data.success) {
          setArticles(data.articles || []);
        }
      } catch (error) {
        console.error('Failed to fetch article suggestions:', error);
        setArticles([]);
      }
    };

    // Debounce the API call
    const timeoutId = setTimeout(fetchArticles, 500);
    return () => clearTimeout(timeoutId);
  }, [fieldValues['system-title'], fieldValues['system-description']]);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/users`);
      const data = await response.json();
      if (data.success) {
        // Transform users to match User interface
        const transformedUsers = data.users.map((u: any) => ({
          id: u.id.toString(),
          name: u.name,
          email: u.email,
          role: u.role as import('@/types').UserRole,
          active: u.active === 1,
          notificationPreferences: {},
        }));
        setUsers(transformedUsers);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Extract title, description, priority, and category from field values
      const title = fieldValues['system-title'] || '';
      const description = fieldValues['system-description'] || '';

      // Use system field IDs directly, with defaults if fields are disabled
      const priority = fieldValues['system-priority'] || 'medium';
      const category = fieldValues['system-category'] || 'General';

      // Build ticket payload
      const payload = {
        title,
        description,
        priority: priority.toLowerCase(), // Ensure lowercase for backend
        category,
        requester_id: Number(user.id),
        department: user.department || null,
        cc_user_ids: ccUserIds.map(id => Number(id)),
        tags: [],
        customFields: fieldValues,
      };

      const response = await fetch(`${API_BASE}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        const ticketId = data.ticket.id;

        // Upload any file attachments
        const fileFields = allFields.filter(f => f.type === 'file');
        for (const field of fileFields) {
          const file = fieldValues[field.id];
          if (file instanceof File) {
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('user_id', user.id);

              await fetch(`${API_BASE}/api/tickets/${ticketId}/attachments`, {
                method: 'POST',
                body: formData,
              });
            } catch (uploadError) {
              console.error('Failed to upload attachment:', uploadError);
              // Don't fail the whole ticket creation if attachment upload fails
            }
          }
        }

        // Show success message
        setShowSuccess(true);

        // Redirect to tickets list after 2 seconds
        setTimeout(() => {
          navigate('/portal/tickets');
        }, 2000);
      } else {
        alert('Failed to create ticket: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Create ticket error:', error);
      alert('Failed to connect to server');
    }
  };

  // Calculate visible fields in hierarchical order (children appear below parents)
  const visibleFields = useMemo(() => {
    return getVisibleFieldsInHierarchicalOrder(allFields, fieldValues);
  }, [allFields, fieldValues]);

  // Handler for field value changes with conditional logic support
  const handleFieldValueChange = (fieldId: string, value: any) => {
    const newFieldValues = { ...fieldValues, [fieldId]: value };

    // Check if any dependent fields should be hidden due to this change
    const fieldsToHide = getFieldsToHide(allFields, newFieldValues, fieldId);

    // Clear values of hidden fields
    fieldsToHide.forEach(hiddenFieldId => {
      delete newFieldValues[hiddenFieldId];
    });

    setFieldValues(newFieldValues);
  };

  // Smart KB article suggestions with tag-based scoring
  const kbSuggestions = useMemo(() => {
    const title = fieldValues['system-title'] || '';
    const description = fieldValues['system-description'] || '';
    const combinedText = `${title} ${description}`.trim().toLowerCase();

    if (combinedText.length < 3 || articles.length === 0) return [];

    // Extract search terms (words longer than 2 characters)
    const searchTerms = combinedText.split(/\s+/).filter(term => term.length > 2);

    // Score each article based on tag matches and content relevance
    const scoredArticles = articles.map(article => {
      let score = 0;

      // Check each search term against article tags and content
      searchTerms.forEach(term => {
        // Exact tag match (highest weight)
        if (article.tags.some(tag => tag.toLowerCase() === term)) {
          score += 5;
        }
        // Partial tag match (high weight)
        else if (article.tags.some(tag => tag.toLowerCase().includes(term))) {
          score += 3;
        }

        // Title match (medium weight)
        if (article.title.toLowerCase().includes(term)) {
          score += 2;
        }

        // Content match (lower weight, check first 500 chars for performance)
        const contentPreview = article.content.substring(0, 500).toLowerCase();
        if (contentPreview.includes(term)) {
          score += 1;
        }
      });

      return { ...article, score };
    });

    // Filter articles with score > 0, sort by score (then by views for tie-breaking)
    return scoredArticles
      .filter(article => article.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.views - a.views; // Tie-breaker: more popular articles first
      })
      .slice(0, 5); // Show top 5 matches
  }, [articles, fieldValues['system-title'], fieldValues['system-description']]);

  // Render field based on type
  const renderField = (field: FormField) => {
    const value = fieldValues[field.id];

    // Special handling for CC users field
    if (field.type === 'cc_users') {
      return (
        <div key={field.id} className="space-y-2">
          <Label htmlFor={field.id}>
            {field.label} {field.required && '*'}
          </Label>
          <UserMultiSelect
            users={users}
            selectedUserIds={ccUserIds}
            onChange={setCcUserIds}
            placeholder={field.placeholder || 'Select users to CC...'}
            disabled={showSuccess}
          />
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
      );
    }

    // Handle other field types
    switch (field.type) {
      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Input
              id={field.id}
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
              maxLength={field.validation?.maxLength}
            />
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Textarea
              id={field.id}
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
              rows={4}
            />
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Input
              id={field.id}
              type="number"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
              min={field.validation?.min}
              max={field.validation?.max}
            />
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={value || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
            />
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Select
              id={field.id}
              value={value || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
            >
              <option value="">{field.placeholder || 'Select an option'}</option>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'multiselect':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <MultiSelect
              options={field.options || []}
              selectedValues={value || []}
              onChange={(values) => handleFieldValueChange(field.id, values)}
              placeholder={field.placeholder || 'Select options...'}
              disabled={showSuccess}
            />
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="space-y-2">
            <Checkbox
              id={field.id}
              checked={value || false}
              onChange={(e) => handleFieldValueChange(field.id, e.target.checked)}
              required={field.required}
              disabled={showSuccess}
              label={field.label + (field.required ? ' *' : '')}
              helperText={field.helpText}
            />
          </div>
        );

      case 'file':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Input
              id={field.id}
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleFieldValueChange(field.id, file);
              }}
              required={field.required}
              disabled={showSuccess}
              className="cursor-pointer"
            />
            {value && (
              <div className="text-sm text-muted-foreground">
                Selected: {value.name}
              </div>
            )}
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'priority':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <div className="flex flex-wrap gap-2">
              {field.options?.map((option) => {
                const normalizedValue = option.toLowerCase() as TicketPriority;
                const isSelected = value === option;

                return (
                  <Badge
                    key={option}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? getPriorityColor(normalizedValue) + ' ring-2 ring-offset-2'
                        : 'hover:bg-accent'
                    } ${showSuccess ? 'pointer-events-none opacity-50' : ''}`}
                    onClick={() => !showSuccess && handleFieldValueChange(field.id, option)}
                  >
                    {option}
                  </Badge>
                );
              })}
            </div>
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      case 'category':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label} {field.required && '*'}
            </Label>
            <Select
              id={field.id}
              value={value || field.defaultValue || ''}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              required={field.required}
              disabled={showSuccess}
            >
              {!field.required && <option value="">{field.placeholder || 'Select category'}</option>}
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {showSuccess && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <AlertCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Ticket created successfully! Redirecting to your tickets...
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form - Full width on mobile */}
        <div className="lg:col-span-2 order-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Render visible fields based on conditional logic */}
                {visibleFields.filter(field => !field.hidden).map((field) => renderField(field))}

                <Button type="submit" className="w-full" disabled={showSuccess}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Ticket
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* KB Suggestions - Shown below form on mobile */}
        <div className="order-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <CardTitle className="text-base">Helpful Articles</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {kbSuggestions.length > 0 ? (
                <div className="space-y-3">
                  <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
                    <Lightbulb className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
                      Found {kbSuggestions.length} article{kbSuggestions.length > 1 ? 's' : ''} that might help! Try checking these before submitting.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    {kbSuggestions.map((article) => (
                      <a
                        key={article.id}
                        href={`/portal/knowledge-base?article=${article.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 border rounded-md hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                              {article.title}
                            </p>
                            <Badge variant="outline" className="text-xs mt-1.5">
                              {article.category_name}
                            </Badge>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    💡 Click an article to open in a new tab
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Start typing your issue in the title field above
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Relevant help articles will appear here automatically
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
