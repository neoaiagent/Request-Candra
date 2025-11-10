
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Download, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useHistory } from '@/contexts/HistoryContext';
import { API_CONFIG } from '@/lib/config';

const ToolWorkspace = ({ tool, onBack, historyItem }) => {
  const { toast } = useToast();
  const { addHistoryItem } = useHistory();

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [inputs, setInputs] = useState({});
  const [file, setFile] = useState(null);
  const [inputFileUrl, setInputFileUrl] = useState(null);

  useEffect(() => {
    const beforeUnloadHandler = (event) => {
      if (isLoading || isProcessing) {
        event.preventDefault();
        event.returnValue = 'A generation process is currently running. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [isLoading, isProcessing]);

  useEffect(() => {
    if (historyItem) {
        setInputs(historyItem.inputs || {});
        setResult(historyItem.result);
        setInputFileUrl(historyItem.inputFileUrl || null);
        setIsLoading(false);
    } else {
        const defaultInputs = {};
        if (tool.id === 'image-to-video') {
            defaultInputs.model = 'pika';
            defaultInputs.prompt = '';
            defaultInputs.negative_prompt = '';
            defaultInputs.aspect_ratio = '1:1';
            defaultInputs.resolution = '720p';
            defaultInputs.duration = 5;
            defaultInputs.ingredients_mode = 'creative';
            defaultInputs.cfg_scale = 0.5;
        } else if (tool.id === 'brief-to-images') {
            defaultInputs.prompt = '';
            defaultInputs.AR = '1:1';
        }
        setInputs(defaultInputs);
        setFile(null);
        setInputFileUrl(null);
        setResult(null);
    }
  }, [tool, historyItem]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  // Enhance prompt using webhook
  const handleEnhancePrompt = async () => {
    const currentPrompt = inputs.prompt || '';
    if (!currentPrompt.trim()) {
      toast({
        title: 'Prompt Required',
        description: 'Please enter a prompt first before enhancing',
        variant: 'destructive',
      });
      return;
    }

    if (isLoading || isProcessing) {
      toast({
        title: 'Please Wait',
        description: 'Please wait for the current operation to complete',
        variant: 'destructive',
      });
      return;
    }

    setIsEnhancingPrompt(true);

    try {
      const formData = new FormData();
      formData.append('prompt', currentPrompt);

      const response = await fetch(API_CONFIG.PROMPT_ENHANCE.WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': '*/*',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to enhance prompt: ${response.status}`);
      }

      // Get response as plain text
      const enhancedPrompt = await response.text();
      
      if (!enhancedPrompt || !enhancedPrompt.trim()) {
        throw new Error('Empty response from enhancement service');
      }
      
      setInputs(prev => ({ ...prev, prompt: enhancedPrompt.trim() }));
      toast({
        title: 'Prompt Enhanced',
        description: 'Your prompt has been enhanced successfully',
      });
    } catch (error) {
      console.error("Error enhancing prompt:", error);
      toast({
        title: 'Enhancement Failed',
        description: error.message || 'Failed to enhance prompt. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (selectedFile) {
        setInputFileUrl(URL.createObjectURL(selectedFile));
    } else {
        setInputFileUrl(null);
    }
  };

  // PING check function to verify backend connectivity
  const pingBackend = async (webhookUrl) => {
    try {
      // For n8n webhooks, try a lightweight OPTIONS request first (CORS preflight)
      // This helps verify connectivity without triggering the actual webhook
      const response = await fetch(webhookUrl, {
        method: 'OPTIONS',
        mode: 'cors',
        headers: {
          'Accept': '*/*',
          'Origin': window.location.origin,
        },
      });
      // OPTIONS request success or any response means backend is reachable
      return true;
    } catch (error) {
      // If OPTIONS fails, try a minimal GET request to a ping endpoint pattern
      try {
        // Try common ping endpoint patterns
        const pingPatterns = [
          webhookUrl.replace('/webhook/', '/ping/'),
          webhookUrl.replace('/webhook/', '/health/'),
          webhookUrl + '/ping',
          webhookUrl + '/health',
        ];
        
        for (const pingUrl of pingPatterns) {
          try {
            const response = await fetch(pingUrl, {
              method: 'GET',
              mode: 'cors',
              headers: {
                'Accept': '*/*',
              },
            });
            if (response.ok) return true;
          } catch (e) {
            continue; // Try next pattern
          }
        }
        
        // If all ping attempts fail, proceed anyway (backend might not have ping endpoint)
        console.warn('PING check failed, proceeding anyway. Backend may not have a ping endpoint.');
        return true;
      } catch (e) {
        console.warn('PING check failed, proceeding anyway:', e);
        return true; // Proceed anyway if ping fails
      }
    }
  };

  // Upload image to imgbb
  const uploadImageToImgbb = async (imageFile) => {
    const formData = new FormData();
    formData.append('key', API_CONFIG.IMGBB.API_KEY);
    formData.append('image', imageFile);

    const response = await fetch(API_CONFIG.IMGBB.UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload image to imgbb');
    }

    const data = await response.json();
    if (data.success && data.data && data.data.url) {
      return data.data.url;
    }
    throw new Error('Failed to get image URL from imgbb');
  };

  // Submit request to fal.ai (Pika)
  const submitPikaRequest = async (imageUrl, prompt, negativePrompt, aspectRatio, resolution, duration, ingredientsMode) => {
    const requestBody = {
      image_urls: [imageUrl],
      prompt: prompt,
      negative_prompt: negativePrompt || '',
      aspect_ratio: aspectRatio,
      resolution: resolution,
      duration: duration,
      ingredients_mode: ingredientsMode,
    };

    const response = await fetch(API_CONFIG.FAL_AI.PIKA.BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${API_CONFIG.FAL_AI.API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to submit request: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // Extract request_id from response
    const requestId = data.request_id || data.id || (data.data && data.data.request_id);
    if (!requestId) {
      throw new Error('No request_id found in response');
    }
    return requestId;
  };

  // Submit request to fal.ai (Kling)
  const submitKlingRequest = async (imageUrl, prompt, negativePrompt, duration, cfgScale) => {
    const requestBody = {
      prompt: prompt,
      image_url: imageUrl,
      duration: duration.toString(),
      negative_prompt: negativePrompt || '',
      cfg_scale: cfgScale,
    };

    const response = await fetch(API_CONFIG.FAL_AI.KLING.BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${API_CONFIG.FAL_AI.API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to submit request: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // Extract request_id from response
    const requestId = data.request_id || data.id || (data.data && data.data.request_id);
    if (!requestId) {
      throw new Error('No request_id found in response');
    }
    return requestId;
  };

  // Poll fal.ai for results (Pika)
  const pollPikaStatus = async (requestId, maxAttempts = 120) => {
    let attempts = 0;
    const pollInterval = 3000; // 3 seconds

    const poll = async () => {
      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - maximum polling attempts reached');
      }

      try {
        const statusUrl = `${API_CONFIG.FAL_AI.PIKA.STATUS_URL}/${requestId}`;
        const response = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${API_CONFIG.FAL_AI.API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          attempts++;
          setProgress(Math.min(95, (attempts / maxAttempts) * 100));
          setProcessingStatus(`Checking status... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return poll();
        }

        const statusData = await response.json();
        
        // Update progress based on status
        const status = statusData.status || statusData.state;
        if (status === 'completed' || status === 'COMPLETED') {
          setProgress(100);
          // Get video URL from response
          const videoUrl = statusData.video?.url || statusData.video_url || 
                          (statusData.data && statusData.data.video?.url) ||
                          (statusData.data && statusData.data.video_url);
          if (videoUrl) {
            return { video_url: videoUrl, type: 'video/mp4' };
          }
          return statusData;
        } else if (status === 'failed' || status === 'FAILED') {
          throw new Error(statusData.error || statusData.message || 'Processing failed');
        } else {
          // Processing or queued
          attempts++;
          const estimatedProgress = Math.min(90, (attempts / maxAttempts) * 100);
          setProgress(estimatedProgress);
          setProcessingStatus(statusData.message || `Processing... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return poll();
        }
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        return poll();
      }
    };

    return poll();
  };

  // Poll fal.ai for results (Kling)
  const pollKlingStatus = async (requestId, maxAttempts = 120) => {
    let attempts = 0;
    const pollInterval = 3000; // 3 seconds

    const poll = async () => {
      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - maximum polling attempts reached');
      }

      try {
        const statusUrl = `${API_CONFIG.FAL_AI.KLING.STATUS_URL}/${requestId}`;
        const response = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${API_CONFIG.FAL_AI.API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          attempts++;
          setProgress(Math.min(95, (attempts / maxAttempts) * 100));
          setProcessingStatus(`Checking status... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return poll();
        }

        const statusData = await response.json();
        
        // Update progress based on status
        const status = statusData.status || statusData.state;
        if (status === 'completed' || status === 'COMPLETED') {
          setProgress(100);
          // Get video URL from response
          const videoUrl = statusData.video?.url || statusData.video_url || 
                          (statusData.data && statusData.data.video?.url) ||
                          (statusData.data && statusData.data.video_url);
          if (videoUrl) {
            return { video_url: videoUrl, type: 'video/mp4' };
          }
          return statusData;
        } else if (status === 'failed' || status === 'FAILED') {
          throw new Error(statusData.error || statusData.message || 'Processing failed');
        } else {
          // Processing or queued
          attempts++;
          const estimatedProgress = Math.min(90, (attempts / maxAttempts) * 100);
          setProgress(estimatedProgress);
          setProcessingStatus(statusData.message || `Processing... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return poll();
        }
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        return poll();
      }
    };

    return poll();
  };

  // Poll for processing status (for text-to-speech)
  const pollProcessingStatus = async (jobId, maxAttempts = 60) => {
    let attempts = 0;
    const pollInterval = 2000; // 2 seconds

    const poll = async () => {
      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - maximum polling attempts reached');
      }

      try {
        const statusUrl = tool.webhook.replace('/webhook/', '/status/') + `?jobId=${jobId}`;
        const response = await fetch(statusUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const statusData = await response.json();
          
          if (statusData.status === 'completed' && statusData.result) {
            return statusData.result;
          } else if (statusData.status === 'failed') {
            throw new Error(statusData.error || 'Processing failed');
          } else if (statusData.status === 'processing') {
            setProcessingStatus(statusData.message || `Processing... (${attempts + 1}/${maxAttempts})`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            return poll();
          } else {
            setProcessingStatus(statusData.message || `Status: ${statusData.status}`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            return poll();
          }
        } else {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return poll();
        }
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        return poll();
      }
    };

    return poll();
  };

  const handleGenerate = async () => {
    // Special handling for image-to-video with fal.ai
    if (tool.id === 'image-to-video') {
      if (!API_CONFIG.FAL_AI.API_KEY) {
        toast({ 
          title: 'API Key Missing', 
          description: 'Please configure fal.ai API key in config.js',
          variant: 'destructive' 
        });
        return;
      }

      if (!file) {
        toast({ 
          title: 'Image Required', 
          description: 'Please upload an image first',
          variant: 'destructive' 
        });
        return;
      }

      if (!inputs.prompt) {
        toast({ 
          title: 'Prompt Required', 
          description: 'Please enter a prompt',
          variant: 'destructive' 
        });
        return;
      }

      setIsLoading(true);
      setIsProcessing(false);
      setProcessingStatus('');
      setProgress(0);
      setResult(null);

      try {
        const selectedModel = inputs.model || 'pika';

        // Step 1: Upload image to imgbb
        setProcessingStatus('Uploading image to imgbb...');
        setProgress(10);
        const imageUrl = await uploadImageToImgbb(file);
        setProgress(30);

        // Step 2: Submit request to fal.ai based on model
        setProcessingStatus(`Submitting request to fal.ai (${selectedModel === 'pika' ? 'Pika 2.2' : 'Kling'})...`);
        setProgress(40);
        let requestId;
        
        if (selectedModel === 'pika') {
          requestId = await submitPikaRequest(
            imageUrl,
            inputs.prompt,
            inputs.negative_prompt || '',
            inputs.aspect_ratio || '1:1',
            inputs.resolution || '720p',
            parseInt(inputs.duration) || 5,
            inputs.ingredients_mode || 'creative'
          );
        } else if (selectedModel === 'kling') {
          requestId = await submitKlingRequest(
            imageUrl,
            inputs.prompt,
            inputs.negative_prompt || '',
            parseInt(inputs.duration) || 5,
            parseFloat(inputs.cfg_scale) || 0.5
          );
        } else {
          throw new Error('Invalid model selected');
        }
        setProgress(50);

        // Step 3: Poll for results based on model
        setIsProcessing(true);
        setProcessingStatus('Generating video... This may take a few minutes.');
        let finalResult;
        
        if (selectedModel === 'pika') {
          finalResult = await pollPikaStatus(requestId);
        } else if (selectedModel === 'kling') {
          finalResult = await pollKlingStatus(requestId);
        }
        
        setResult({
          video_url: finalResult.video_url,
          type: 'video/mp4',
          url: finalResult.video_url,
        });

        addHistoryItem({
          id: Date.now().toString(),
          toolName: tool.name,
          toolId: tool.id,
          date: new Date().toISOString(),
          status: 'Completed',
          inputs,
          result: {
            video_url: finalResult.video_url,
            type: 'video/mp4',
            url: finalResult.video_url,
          },
          inputFileUrl: inputFileUrl,
        });
        toast({ title: 'Generation Complete!' });
      } catch (error) {
        console.error("Error during generation:", error);
        const errorResult = { error: 'Generation Failed', message: error.message };
        setResult(errorResult);
        addHistoryItem({
          id: Date.now().toString(),
          toolName: tool.name,
          toolId: tool.id,
          date: new Date().toISOString(),
          status: 'Failed',
          inputs,
          result: errorResult,
          inputFileUrl: inputFileUrl,
        });
        toast({ 
          title: 'Error', 
          description: error.message || 'Generation failed. Check the output for details.', 
          variant: 'destructive' 
        });
      } finally {
        setIsLoading(false);
        setIsProcessing(false);
        setProcessingStatus('');
        setProgress(0);
      }
      return;
    }

    // Original webhook-based tools
    if (!tool.webhook) {
      toast({ title: 'Tool not configured', variant: 'destructive' });
      return;
    }
    
    setIsLoading(true);
    setIsProcessing(false);
    setProcessingStatus('');
    setProgress(0);
    setResult(null);
    
    // PING check for text-to-speech tool
    if (tool.id === 'text-to-speech') {
      setProcessingStatus('Checking backend connection...');
      const isBackendAvailable = await pingBackend(tool.webhook);
      if (!isBackendAvailable) {
        toast({ 
          title: 'Backend Unavailable', 
          description: 'Unable to connect to the backend service. Please try again later.',
          variant: 'destructive' 
        });
        setIsLoading(false);
        return;
      }
    }

    const formData = new FormData();
    if (file) formData.append('image', file);
    for (const key in inputs) {
      if (inputs[key] !== null && inputs[key] !== undefined) {
        formData.append(key, inputs[key]);
      }
    }

    try {
      setProcessingStatus('Sending request...');
      
      // For text-to-speech, check if backend supports async processing
      const isTextToSpeech = tool.id === 'text-to-speech';
      
      const fetchOptions = {
        method: 'POST',
        body: formData,
        mode: 'cors',
        credentials: 'omit', // Don't send credentials to avoid CORS issues
        headers: {
          'Accept': '*/*',
        },
      };

      const response = await fetch(tool.webhook, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const contentType = response.headers.get("content-type");
      let responseData;

      // Check if response indicates async processing (for text-to-speech)
      if (isTextToSpeech && contentType && contentType.includes("application/json")) {
        const jsonData = await response.json();
        
        // If backend returns a job ID, start polling
        if (jsonData.jobId || jsonData.status === 'processing') {
          setIsProcessing(true);
          setProcessingStatus('Processing your request...');
          
          try {
            // Poll for completion
            const finalResult = await pollProcessingStatus(jsonData.jobId || jsonData.id);
            responseData = finalResult;
          } catch (pollError) {
            throw new Error(`Processing failed: ${pollError.message}`);
          } finally {
            setIsProcessing(false);
            setProcessingStatus('');
          }
        } else {
          responseData = jsonData;
        }
      }
      // Handle JSON response
      else if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
      } 
      // Handle binary file response (e.g., video, image, audio)
      else {
        setProcessingStatus('Receiving file...');
        const blob = await response.blob();
        responseData = { blob: blob, url: URL.createObjectURL(blob), type: blob.type };
      }

      setResult(responseData);
      addHistoryItem({
        id: Date.now().toString(),
        toolName: tool.name,
        toolId: tool.id,
        date: new Date().toISOString(),
        status: 'Completed',
        inputs,
        result: responseData,
        inputFileUrl: tool.id === 'brief-to-images' ? responseData.url : inputFileUrl,
      });
      toast({ title: 'Generation Complete!' });

    } catch (error) {
      console.error("Error during generation:", error);
      const errorResult = { error: 'Generation Failed', message: error.message };
      setResult(errorResult);
      setIsProcessing(false);
      setProcessingStatus('');
      addHistoryItem({
        id: Date.now().toString(),
        toolName: tool.name,
        toolId: tool.id,
        date: new Date().toISOString(),
        status: 'Failed',
        inputs,
        result: errorResult,
        inputFileUrl: inputFileUrl,
      });
      toast({ title: 'Error', description: 'Generation failed. Check the output for details.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    
    // If the result is a blob, use its URL
    if (result.blob && result.url) {
      const link = document.createElement('a');
      link.href = result.url;
      const fileExtension = result.type ? result.type.split('/')[1] : 'dat';
      link.setAttribute('download', `neoai-result-${Date.now()}.${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // If the result is from JSON with a URL
    const urlToDownload = (result.data && result.data.video_url) || result.video_url || result.audio_url || result.image_url;
    if (urlToDownload && typeof urlToDownload === 'string') {
      const link = document.createElement('a');
      link.href = urlToDownload;
      link.setAttribute('download', '');
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
       toast({ title: 'No downloadable file', variant: 'destructive' });
    }
  };

  const handleClear = () => {
    onBack();
  };
  
  const renderInputs = () => {
    switch (tool.id) {
        case 'social-media-generator':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image</label>
              <input type="file" onChange={handleFileChange} className="input-field" accept="image/*" disabled={isLoading || historyItem}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Image Prompt</label>
              <textarea name="image_prompt" value={inputs.image_prompt || ''} onChange={handleInputChange} rows={3} className="input-field" placeholder="e.g., a futuristic city skyline at sunset" disabled={isLoading || historyItem}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Brief Narasi (Caption)</label>
              <textarea name="caption_prompt" value={inputs.caption_prompt || ''} onChange={handleInputChange} rows={3} className="input-field" placeholder="e.g., create a catchy caption about innovation" disabled={isLoading || historyItem}/>
            </div>
          </>
        );
      case 'text-to-speech':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brief Narasi</label>
            <textarea name="prompt" value={inputs.prompt || ''} onChange={handleInputChange} rows={5} className="input-field" placeholder="Type the text you want to convert to speech..." disabled={isLoading || historyItem}/>
          </div>
        );
      case 'image-to-video':
        const selectedModel = inputs.model || 'pika';
        return (
            <>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                    <select name="model" value={selectedModel} onChange={handleInputChange} className="input-field" required disabled={isLoading || historyItem}>
                        <option value="pika">Pika 2.2</option>
                        <option value="kling">Kling</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image</label>
                    <input type="file" onChange={handleFileChange} className="input-field" accept="image/*" required disabled={isLoading || historyItem}/>
                    {inputFileUrl && (
                      <img src={inputFileUrl} alt="Preview" className="mt-2 w-full rounded-lg max-h-48 object-cover" />
                    )}
                </div>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">Prompt</label>
                        <button
                            type="button"
                            onClick={handleEnhancePrompt}
                            disabled={isLoading || isProcessing || isEnhancingPrompt || historyItem || !inputs.prompt?.trim()}
                            className="text-xs px-3 py-1 bg-[#0573AC] text-white rounded hover:bg-[#045a8a] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            {isEnhancingPrompt ? (
                                <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Enhancing...
                                </>
                            ) : (
                                'Tingkatkan Prompt'
                            )}
                        </button>
                    </div>
                    <textarea name="prompt" value={inputs.prompt || ''} onChange={handleInputChange} rows={3} className="input-field" placeholder="e.g., make the clouds move, zoom in slowly" required disabled={isLoading || historyItem}/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Negative Prompt (Optional)</label>
                    <textarea name="negative_prompt" value={inputs.negative_prompt || ''} onChange={handleInputChange} rows={2} className="input-field" placeholder="e.g., blurry, low quality" disabled={isLoading || historyItem}/>
                </div>
                {selectedModel === 'pika' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
                            <select name="aspect_ratio" value={inputs.aspect_ratio || '1:1'} onChange={handleInputChange} className="input-field" required disabled={isLoading || historyItem}>
                                <option value="1:1">1:1</option>
                                <option value="9:16">9:16</option>
                                <option value="16:9">16:9</option>
                                <option value="3:2">3:2</option>
                                <option value="2:3">2:3</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Resolution</label>
                            <select name="resolution" value={inputs.resolution || '720p'} onChange={handleInputChange} className="input-field" required disabled={isLoading || historyItem}>
                                <option value="720p">720p</option>
                                <option value="1080p">1080p</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients Mode</label>
                            <select name="ingredients_mode" value={inputs.ingredients_mode || 'creative'} onChange={handleInputChange} className="input-field" required disabled={isLoading || historyItem}>
                                <option value="creative">Creative</option>
                                <option value="precise">Precise</option>
                            </select>
                        </div>
                    </>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                    <select name="duration" value={inputs.duration || 5} onChange={handleInputChange} className="input-field" required disabled={isLoading || historyItem}>
                        <option value={5}>5 detik</option>
                        <option value={10}>10 detik</option>
                    </select>
                </div>
                {selectedModel === 'kling' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            CFG Scale: {inputs.cfg_scale || 0.5}
                        </label>
                        <input
                            type="range"
                            name="cfg_scale"
                            min="0"
                            max="1"
                            step="0.1"
                            value={inputs.cfg_scale || 0.5}
                            onChange={handleInputChange}
                            className="w-full"
                            disabled={isLoading || historyItem}
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0</span>
                            <span>1</span>
                        </div>
                    </div>
                )}
            </>
        );
      case 'image-editing':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image</label>
              <input type="file" onChange={handleFileChange} className="input-field" accept="image/*" disabled={isLoading || historyItem}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Edit Prompt</label>
              <textarea name="image_prompt" value={inputs.image_prompt || ''} onChange={handleInputChange} rows={3} className="input-field" placeholder="e.g., make the sky blue, add a cat" disabled={isLoading || historyItem}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
              <select name="aspect_ratio" value={inputs.aspect_ratio || '1:1'} onChange={handleInputChange} className="input-field" disabled={isLoading || historyItem}>
                <option value="1:1">1:1 (Square)</option>
                <option value="9:16">9:16 (Vertical)</option>
                <option value="16:9">16:9 (Widescreen)</option>
                <option value="4:3">4:3 (Standard)</option>
                <option value="3:4">3:4 (Portrait)</option>
              </select>
            </div>
          </>
        );
      case 'brief-to-images':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prompt</label>
              <textarea name="prompt" value={inputs.prompt || ''} onChange={handleInputChange} rows={5} className="input-field" placeholder="e.g., a stunning synthwave landscape with a retro car" disabled={isLoading || historyItem}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
              <select name="AR" value={inputs.AR || '1:1'} onChange={handleInputChange} className="input-field" disabled={isLoading || historyItem}>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="3:4">3:4</option>
                <option value="4:3">4:3</option>
              </select>
            </div>
          </>
        );
      default:
        return <p className="text-sm text-gray-600">This tool is not yet configured.</p>;
    }
  };

  const renderOutput = () => {
    if (isLoading || isProcessing) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
          <Loader2 className="w-12 h-12 animate-spin text-[#0573AC]" />
          <p className="mt-4 text-lg font-medium">
            {isProcessing ? (processingStatus || 'Processing... Please wait.') : 'Generating... Please wait.'}
          </p>
          {isProcessing && processingStatus && (
            <p className="mt-2 text-sm text-gray-400">{processingStatus}</p>
          )}
          {(isLoading || isProcessing) && progress > 0 && (
            <div className="w-full max-w-md mt-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-[#0573AC] h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      );
    }
    if (!result) {
        return (
            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500">Generated output will appear here</p>
            </div>
          );
    }
    if (result.error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-500 bg-red-50 rounded-lg p-4">
              <AlertTriangle className="w-12 h-12" />
              <h4 className="mt-4 text-lg font-semibold">{result.error}</h4>
              <p className="mt-2 text-sm text-red-700 text-center">{result.message}</p>
            </div>
          );
    }
    
    // Check for blob URL first, then check for URL from JSON
    const videoUrl = result.url && result.type?.startsWith('video/') ? result.url : (result.data && result.data.video_url) || result.video_url;
    if (videoUrl) {
        return <video controls src={videoUrl} className="w-full rounded-lg shadow-md" />;
    }

    const imageUrl = result.url && result.type?.startsWith('image/') ? result.url : result.image_url;
    if (imageUrl) {
        return <img src={imageUrl} alt="Generated output" className="rounded-lg shadow-md w-full" />;
    }

    const audioUrl = result.url && result.type?.startsWith('audio/') ? result.url : result.audio_url;
    if (audioUrl) {
        return <audio controls src={audioUrl} className="w-full" />;
    }

    return <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <div className="p-6 space-y-6">
      <nav id="crumbs" className="breadcrumb">
        <button onClick={onBack} className="flex items-center gap-2 text-[#0573AC] hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-gray-400 mx-2">/</span>
        <span className="text-gray-600">Dashboard</span>
        <span className="text-gray-400 mx-2">›</span>
        <span className="font-medium text-[#013353]" data-id="tool-name">{tool?.name}</span>
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        id="tool-layout"
        className="grid lg:grid-cols-5 gap-6"
      >
        <aside id="tool-inputs" className="lg:col-span-2 space-y-4">
          <div className="card">
            <h3 className="text-lg font-semibold text-[#013353] mb-4">Input Parameters</h3>
            <div className="space-y-4">{renderInputs()}</div>
          </div>
        </aside>

        <main id="tool-output" className="lg:col-span-3">
          <div className="card h-full min-h-[400px]">
            <h3 className="text-lg font-semibold text-[#013353] mb-4">Output</h3>
            {renderOutput()}
          </div>
        </main>
      </motion.div>

      <div id="tool-actions" className="sticky-actions">
        <button onClick={handleClear} className="btn-ghost flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Clear
        </button>
        <div className="flex gap-3">
          {result && !result.error && (
            <button onClick={handleDownload} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Download
            </button>
          )}
          {!historyItem && <button
            id="btn-generate"
            onClick={handleGenerate}
            disabled={isLoading}
            className="btn-primary flex items-center gap-2 min-w-[120px] justify-center"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> Generate</>}
          </button>}
        </div>
      </div>
    </div>
  );
};

export default ToolWorkspace;
