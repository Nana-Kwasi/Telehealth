import React, { useState, useEffect } from 'react';
import { auth, db } from '../../Auth/firebaseConfig';
import './Resources.css';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  BookOpen, 
  FileText, 
  Video, 
  Download, 
  Star, 
  Clock, 
  User, 
  Search,
  Grid,
  List,
  Heart,
  Share2,
  Eye,
  Play,
  ClipboardList,
  CheckCircle,
  Send,
  Target,
  AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';

export default function ClientResources() {
  const [resources, setResources] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('resources');
  const [viewMode, setViewMode] = useState('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [showWorksheetModal, setShowWorksheetModal] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetResponses, setWorksheetResponses] = useState({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

  const currentUser = auth.currentUser;

  const categories = [
    { id: 'resources', name: 'Resources', icon: BookOpen },
    { id: 'notes', name: 'Notes', icon: FileText },
    { id: 'worksheets', name: 'Worksheets', icon: Download }
  ];


  // Fetch resources function
  const fetchAssignedResources = async () => {
      try {
        if (!currentUser) return;

        const allResources = [];

        // Fetch public resources
        try {
        const publicResourcesQuery = query(
          collection(db, 'resources'),
            where('isPublic', '==', true)
        );
        const publicSnapshot = await getDocs(publicResourcesQuery);
        const publicResources = publicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'public'
        }));
        allResources.push(...publicResources);
        } catch (error) {
          console.log('Public resources query failed:', error);
          // Skip public resources if query fails
        }

        // Fetch resources assigned to this client
        const assignedClientId = localStorage.getItem('th.clientId') || currentUser.uid;
        try {
        const assignedResourcesQuery = query(
          collection(db, 'therapistResources')
        );
        const assignedSnapshot = await getDocs(assignedResourcesQuery);
        
        // Filter resources based on target audience
        const assignedResources = assignedSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(resource => {
            // Check if resource is assigned to this specific client
            if (resource.assignedClients && resource.assignedClients.includes(assignedClientId)) {
              return true;
            }
            
            // Check target audience filtering
            if (resource.targetAudience === 'all') {
              return true;
            }
            
            if (resource.targetAudience === 'specific' && resource.assignedClients?.includes(assignedClientId)) {
              return true;
            }
            
            // For individual/teen/couples, we need to check client's therapy type
            // This would require fetching client data - for now, we'll include all
            if (['individuals', 'teen', 'couples'].includes(resource.targetAudience)) {
              return true;
            }
            
            return false;
          })
          .map(resource => ({
            ...resource,
            type: 'resource'
          }));
        
        allResources.push(...assignedResources);
        } catch (error) {
          console.log('Assigned resources query failed:', error);
          // Skip assigned resources if query fails
        }

        // Remove duplicates and sort by creation date
        const uniqueResources = allResources.filter((resource, index, self) => 
          index === self.findIndex(r => r.id === resource.id)
        );
        
        uniqueResources.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });

        setResources(uniqueResources);

        // Fetch assigned worksheets
        const worksheetClientId = localStorage.getItem('th.clientId') || currentUser.uid;
        
        let assignedWorksheets = [];
        
        try {
          // First try: Simple query without compound filters
          const simpleWorksheetsQuery = query(
            collection(db, 'worksheets'),
            where('assignedTo', 'array-contains', worksheetClientId)
          );
          const worksheetsSnapshot = await getDocs(simpleWorksheetsQuery);
          
          // Filter client-side for active status and sort by date
          assignedWorksheets = worksheetsSnapshot.docs
            .filter(doc => {
              const data = doc.data();
              return data.status === 'active';
            })
            .sort((a, b) => {
              const dateA = a.data().dateCreated?.toDate ? a.data().dateCreated.toDate() : new Date(a.data().dateCreated);
              const dateB = b.data().dateCreated?.toDate ? b.data().dateCreated.toDate() : new Date(b.data().dateCreated);
              return dateB - dateA;
            })
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                type: 'worksheet'
              };
            });
        } catch (error) {
          console.log('Simple query also failed, trying fallback:', error);
          // Fallback: fetch all worksheets and filter client-side
          const allWorksheetsQuery = query(collection(db, 'worksheets'));
          const allWorksheetsSnapshot = await getDocs(allWorksheetsQuery);
          
          assignedWorksheets = allWorksheetsSnapshot.docs
            .filter(doc => {
              const data = doc.data();
              return data.assignedTo && 
                     data.assignedTo.includes(worksheetClientId) && 
                     data.status === 'active';
            })
            .sort((a, b) => {
              const dateA = a.data().dateCreated?.toDate ? a.data().dateCreated.toDate() : new Date(a.data().dateCreated);
              const dateB = b.data().dateCreated?.toDate ? b.data().dateCreated.toDate() : new Date(b.data().dateCreated);
              return dateB - dateA;
            })
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                type: 'worksheet'
              };
            });
        }
        
        setWorksheets(assignedWorksheets);

        // Fetch notes for this client
        let assignedNotes = [];
        try {
          // Fetch clinical notes assigned to this client
          const clinicalNotesQuery = query(collection(db, 'clinicalNotes'));
          const clinicalNotesSnapshot = await getDocs(clinicalNotesQuery);
          
          const clinicalNotes = clinicalNotesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(note => {
              // Check if note is visible to client and assigned to this client
              return note.visibleToClient && note.clientId === assignedClientId;
            })
            .map(note => ({
              ...note,
              type: 'note',
              noteType: 'clinical'
            }));

          // Fetch therapy books based on target audience
          const therapyBooksQuery = query(collection(db, 'therapyBooks'));
          const therapyBooksSnapshot = await getDocs(therapyBooksQuery);
          
          const therapyBooks = therapyBooksSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(book => {
              // Check target audience filtering
              if (book.targetAudience === 'all') {
                return true;
              }
              
              if (book.targetAudience === 'specific' && book.assignedClients?.includes(assignedClientId)) {
                return true;
              }
              
              // For individual/teen/couples, we need to check client's therapy type
              // This would require fetching client data - for now, we'll include all
              if (['individuals', 'teen', 'couples'].includes(book.targetAudience)) {
                return true;
              }
              
              return false;
            })
            .map(book => ({
              ...book,
              type: 'note',
              noteType: 'therapyBook'
            }));

          assignedNotes = [...clinicalNotes, ...therapyBooks];
        } catch (error) {
          console.log('Notes query failed:', error);
        }

        setNotes(assignedNotes);

        // Combine resources, worksheets, and notes
        const allItems = [...uniqueResources, ...assignedWorksheets, ...assignedNotes];
        setFilteredResources(allItems);

        // Load favorites from localStorage
        const savedFavorites = localStorage.getItem('th.resourceFavorites');
        if (savedFavorites) {
          setFavorites(JSON.parse(savedFavorites));
        }

      } catch (error) {
        console.error('Error fetching resources:', error);
      } finally {
        setIsLoading(false);
      }
    };

  // Fetch resources on component mount
  useEffect(() => {
    fetchAssignedResources();
  }, [currentUser]);

  // Filter resources based on search and category
  useEffect(() => {
    let filtered = [...resources, ...worksheets, ...notes];

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.goal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.noteContent?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory === 'resources') {
      filtered = filtered.filter(item => item.type === 'resource' || item.type === 'assigned' || item.type === 'public');
    } else if (selectedCategory === 'notes') {
      filtered = filtered.filter(item => item.type === 'note');
    } else if (selectedCategory === 'worksheets') {
      filtered = filtered.filter(item => item.type === 'worksheet');
    }

    setFilteredResources(filtered);
  }, [resources, worksheets, notes, searchTerm, selectedCategory]);

  const toggleFavorite = (resourceId) => {
    const newFavorites = favorites.includes(resourceId)
      ? favorites.filter(id => id !== resourceId)
      : [...favorites, resourceId];
    
    setFavorites(newFavorites);
    localStorage.setItem('th.resourceFavorites', JSON.stringify(newFavorites));
  };

  const getResourceIcon = (item) => {
    if (item.type === 'worksheet') {
      return <ClipboardList size={24} />;
    }
    
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') {
        return <BookOpen size={24} />;
      }
      return <FileText size={24} />;
    }
    
    switch (item.category) {
      case 'articles':
        return <FileText size={24} />;
      case 'exercises':
        return <BookOpen size={24} />;
      case 'videos':
        return <Video size={24} />;
      case 'worksheets':
        return <Download size={24} />;
      default:
        return <BookOpen size={24} />;
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getResourceTypeColor = (item) => {
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') {
        return 'bg-purple-100 text-purple-800';
      }
      return 'bg-yellow-100 text-yellow-800';
    }
    
    switch (item.type) {
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'public':
        return 'bg-green-100 text-green-800';
      case 'worksheet':
        return 'bg-purple-100 text-purple-800';
      case 'resource':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Handle worksheet view
  const handleWorksheetView = (worksheet) => {
    setSelectedWorksheet(worksheet);
    setShowWorksheetModal(true);
    
    // Initialize responses for this worksheet
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    
    if (clientResponse && clientResponse.responses) {
      // Pre-fill with existing responses (regardless of completion status)
      setWorksheetResponses(clientResponse.responses || {});
    } else {
      // Initialize empty responses
      setWorksheetResponses({});
    }
  };

  // Check if worksheet is completed by current client
  const isWorksheetCompleted = (worksheet) => {
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.status === 'completed' && !clientResponse?.needsToCompleteNewFields;
  };

  // Check if worksheet has new fields that need completion
  const hasNewFields = (worksheet) => {
    const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.needsToCompleteNewFields === true;
  };

  // Check if worksheet has been updated
  const hasUpdates = (worksheet) => {
    return worksheet.hasNewFields === true;
  };

  // Handle response change
  const handleResponseChange = (fieldIndex, value) => {
    setWorksheetResponses(prev => ({
      ...prev,
      [fieldIndex]: value
    }));
  };

  // Submit worksheet responses
  const handleSubmitWorksheet = async () => {
    try {
      const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
      const clientResponse = selectedWorksheet.clientResponses?.[clientId];
      const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
      
      // Merge new responses with existing ones
      const existingResponses = clientResponse?.responses || {};
      const mergedResponses = { ...existingResponses, ...worksheetResponses };
      
      // Determine completion status
      const allFieldsAnswered = selectedWorksheet.fields.every((_, index) => 
        mergedResponses[index] !== undefined && mergedResponses[index] !== ''
      );
      
      // Update the worksheet document with client responses
      const worksheetRef = doc(db, 'worksheets', selectedWorksheet.id);
      await updateDoc(worksheetRef, {
        [`clientResponses.${clientId}`]: {
          responses: mergedResponses,
          submittedAt: serverTimestamp(),
          status: allFieldsAnswered ? 'completed' : 'pending',
          needsToCompleteNewFields: false // Reset this flag after submission
        }
      });
      
      alert(hasNewFields ? 'New fields submitted successfully!' : 'Worksheet submitted successfully!');
      setShowWorksheetModal(false);
      setSelectedWorksheet(null);
      setWorksheetResponses({});
      
      // Refresh worksheets to show updated status
      fetchAssignedResources();
      
    } catch (error) {
      console.error('Error submitting worksheet:', error);
      alert('Error submitting worksheet. Please try again.');
    }
  };

  // Generate PDF for resources
  const generateResourcePDF = (resource) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    let yPosition = 20;

    // Add watermark
    try {
      pdf.setGState(new pdf.GState({opacity: 0.1}));
      pdf.setFontSize(50);
      pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
      pdf.text('NessaHub', pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' });
      pdf.setGState(new pdf.GState({opacity: 1}));
    } catch (error) {
      // Fallback if GState is not supported
      console.log('Watermark not supported');
    }

    // Reset text settings
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);

    // Header
    pdf.setFontSize(18);
    pdf.setFont(undefined, 'bold');
    pdf.text(resource.title, 20, yPosition);
    yPosition += 15;

    // Meta information
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Created: ${formatDate(resource.createdAt)}`, 20, yPosition);
    yPosition += 8;
    
    if (resource.category) {
      pdf.text(`Category: ${resource.category}`, 20, yPosition);
      yPosition += 8;
    }

    // Description
    if (resource.description) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.text('Description', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      const descriptionLines = pdf.splitTextToSize(resource.description, pageWidth - 40);
      pdf.text(descriptionLines, 20, yPosition);
      yPosition += descriptionLines.length * 5 + 10;
    }

    // Content
    if (resource.content) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.text('Content', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      const contentLines = pdf.splitTextToSize(resource.content, pageWidth - 40);
      
      for (let i = 0; i < contentLines.length; i++) {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.text(contentLines[i], 20, yPosition);
        yPosition += 6; // Increased line spacing for better readability
      }
    }

    // Footer with page number
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth - 30, pageHeight - 10);
      pdf.text('NessaHub', 20, pageHeight - 10);
    }

    pdf.save(`${resource.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  // Generate PDF for notes
  const generateNotePDF = (note) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    let yPosition = 20;

    // Add watermark to all pages
    const addWatermark = (pageNum) => {
      try {
        pdf.setGState(new pdf.GState({opacity: 0.1}));
        pdf.setFontSize(50);
        pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
        pdf.text('NessaHub', pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' });
        pdf.setGState(new pdf.GState({opacity: 1}));
      } catch (error) {
        console.log('Watermark not supported');
      }
    };

    // Reset text settings with darker color for better visibility
    pdf.setTextColor(0, 0, 0); // Pure black for maximum contrast
    pdf.setFontSize(12);
    
    // Helper function to ensure text is always dark
    const setDarkText = (r = 0, g = 0, b = 0) => {
      pdf.setTextColor(r, g, b);
    };
    
    // Override the text method to always use dark color and maintain current font size
    const originalText = pdf.text;
    pdf.text = function(text, x, y, options) {
      pdf.setTextColor(0, 0, 0); // Always set to black before text
      // Don't change font size here to avoid conflicts
      return originalText.call(this, text, x, y, options);
    };
    
    // Override splitTextToSize to ensure it also uses dark color
    const originalSplitTextToSize = pdf.splitTextToSize;
    pdf.splitTextToSize = function(text, maxWidth, options) {
      pdf.setTextColor(0, 0, 0); // Always set to black before splitting text
      return originalSplitTextToSize.call(this, text, maxWidth, options);
    };
    
    // Override setFont to always reset text color to black and maintain font size
    const originalSetFont = pdf.setFont;
    pdf.setFont = function(fontName, fontStyle, fontSize) {
      const result = originalSetFont.call(this, fontName, fontStyle, fontSize);
      pdf.setTextColor(0, 0, 0); // Always set to black after font change
      // Don't override font size here to avoid conflicts
      return result;
    };

    if (note.noteType === 'therapyBook') {
      // Therapy Book PDF Generation
      
      // Cover Page
      addWatermark(1);
      pdf.setFontSize(24);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 0, 0); // Ensure dark color
      pdf.text(note.bookTitle || 'Therapy Book', 20, yPosition);
      yPosition += 20;

      if (note.author) {
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text(`By: ${note.author}`, 20, yPosition);
        yPosition += 15;
      }

      if (note.description) {
        yPosition += 10;
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Description', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
        const descriptionLines = pdf.splitTextToSize(note.description, pageWidth - 40);
        pdf.text(descriptionLines, 20, yPosition);
        yPosition += descriptionLines.length * 5 + 10;
      }

      // Meta information
      if (note.targetAudience || note.difficultyLevel || note.estimatedReadingTime) {
        yPosition += 10;
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Book Information', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        if (note.targetAudience) {
          pdf.text(`Target Audience: ${note.targetAudience}`, 20, yPosition);
          yPosition += 8;
        }
        if (note.difficultyLevel) {
          pdf.text(`Difficulty Level: ${note.difficultyLevel}`, 20, yPosition);
          yPosition += 8;
        }
        if (note.estimatedReadingTime) {
          pdf.text(`Estimated Reading Time: ${note.estimatedReadingTime}`, 20, yPosition);
          yPosition += 8;
        }
      }

      // Table of Contents
      if (note.tableOfContents) {
        pdf.addPage();
        addWatermark(2);
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Table of Contents', 20, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
        const tocLines = pdf.splitTextToSize(note.tableOfContents, pageWidth - 40);
        pdf.text(tocLines, 20, yPosition);
        yPosition += tocLines.length * 5 + 15;
      }

      // Chapters Content
      if (note.chapters) {
        pdf.addPage();
        addWatermark(3);
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Chapters', 20, yPosition);
        yPosition += 15;
        
        // Parse and format chapters content with better structure
        let chaptersContent = note.chapters;
        
        // Split content into lines for better processing
        const lines = chaptersContent.split('\n');
        let currentChapter = '';
        let currentContent = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          if (!line) {
            // Empty line - add to current content if we have any
            if (currentContent.length > 0) {
              currentContent.push('');
            }
            continue;
          }
          
          // Check if this line is a chapter header
          const isChapterHeader = /^(Chapter \d+|CHAPTER \d+|chapter \d+)/i.test(line) || 
                                 /^\*\*.*\*\*$/.test(line) || // Markdown bold
                                 (line.length < 80 && line === line.toUpperCase() && line.includes('Chapter'));
          
          if (isChapterHeader) {
            // Process previous chapter if exists
            if (currentChapter && currentContent.length > 0) {
              // Add chapter header
              if (yPosition > pageHeight - 40) {
                pdf.addPage();
                addWatermark(pdf.internal.getNumberOfPages());
                yPosition = 20;
              }
              
              pdf.setFontSize(14);
              pdf.setFont(undefined, 'bold');
              pdf.setTextColor(0, 0, 0); // Ensure dark color
              pdf.text(currentChapter, 20, yPosition);
              yPosition += 18; // Increased spacing for 14pt bold chapter headers
              
              // Add chapter content
              const contentText = currentContent.join('\n');
              if (contentText.trim()) {
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
                const contentLines = pdf.splitTextToSize(contentText, pageWidth - 40);
                
                for (let j = 0; j < contentLines.length; j++) {
                  if (yPosition > pageHeight - 30) {
                    pdf.addPage();
                    addWatermark(pdf.internal.getNumberOfPages());
                    yPosition = 20;
                  }
                  pdf.setFontSize(10); // Ensure correct font size
                  pdf.setFont(undefined, 'normal');
                  pdf.setTextColor(0, 0, 0); // Force black color before each line
                  pdf.text(contentLines[j], 20, yPosition);
                  yPosition += 6; // Increased line spacing for 10pt font
                }
              }
              
              yPosition += 20; // Increased space between chapters
            }
            
            // Start new chapter
            currentChapter = line.replace(/\*\*/g, ''); // Remove markdown bold markers
            currentContent = [];
          } else {
            // This is content for current chapter
            currentContent.push(line);
          }
        }
        
        // Process the last chapter
        if (currentChapter && currentContent.length > 0) {
          // Add chapter header
          if (yPosition > pageHeight - 40) {
            pdf.addPage();
            addWatermark(pdf.internal.getNumberOfPages());
            yPosition = 20;
          }
          
          pdf.setFontSize(14);
          pdf.setFont(undefined, 'bold');
          pdf.setTextColor(0, 0, 0); // Ensure dark color
          pdf.text(currentChapter, 20, yPosition);
          yPosition += 18; // Increased spacing for 14pt bold chapter headers
          
          // Add chapter content
          const contentText = currentContent.join('\n');
          if (contentText.trim()) {
            pdf.setFontSize(10);
            pdf.setFont(undefined, 'normal');
            pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
            const contentLines = pdf.splitTextToSize(contentText, pageWidth - 40);
            
            for (let j = 0; j < contentLines.length; j++) {
              if (yPosition > pageHeight - 30) {
                pdf.addPage();
                addWatermark(pdf.internal.getNumberOfPages());
                yPosition = 20;
              }
              pdf.setFontSize(10); // Ensure correct font size
              pdf.setFont(undefined, 'normal');
              pdf.setTextColor(0, 0, 0); // Force black color before each line
              pdf.text(contentLines[j], 20, yPosition);
              yPosition += 6; // Increased line spacing for 10pt font
            }
          }
        }
        
        // If no chapters were found, format as regular content
        if (!currentChapter) {
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
          const contentLines = pdf.splitTextToSize(chaptersContent, pageWidth - 40);
          
          for (let i = 0; i < contentLines.length; i++) {
            if (yPosition > pageHeight - 30) {
              pdf.addPage();
              addWatermark(pdf.internal.getNumberOfPages());
              yPosition = 20;
            }
            pdf.setFontSize(10); // Ensure correct font size
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(10); // Ensure correct font size
            pdf.setFont(undefined, 'normal');
            pdf.setTextColor(0, 0, 0); // Force black color before each line
            pdf.text(contentLines[i], 20, yPosition);
            yPosition += 6; // Increased line spacing for better readability
          }
        }
      }

      // Key Topics
      if (note.keyTopics) {
        pdf.addPage();
        addWatermark(pdf.internal.getNumberOfPages());
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Key Topics', 20, yPosition);
        yPosition += 15;
        
        // Format key topics with better structure
        const topicsContent = note.keyTopics;
        
        // Check if content has bullet points or numbered lists
        const hasBullets = topicsContent.includes('•') || topicsContent.includes('-') || topicsContent.includes('*');
        const hasNumbers = /\d+\./.test(topicsContent);
        
        if (hasBullets || hasNumbers) {
          // Split by bullet points or numbers
          const items = topicsContent.split(/(?=•|-\s|\*\s|\d+\.)/).filter(item => item.trim());
          
          for (let item of items) {
            if (item.trim()) {
              // Check if this item looks like a heading (short, all caps)
              const isHeading = item.trim().length < 100 && 
                               (item.trim() === item.trim().toUpperCase() || 
                                /^\d+\./.test(item.trim()));
              
              if (isHeading) {
                // Format as heading
                if (yPosition > pageHeight - 30) {
                  pdf.addPage();
                  addWatermark(pdf.internal.getNumberOfPages());
                  yPosition = 20;
                }
                
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(0, 0, 0); // Ensure dark color
                pdf.text(item.trim(), 20, yPosition);
                yPosition += 14; // Increased spacing for 12pt bold text
              } else {
                // Format as regular item
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(0, 0, 0); // Ensure dark color
                const itemText = pdf.splitTextToSize(item.trim(), pageWidth - 40);
                
                for (let i = 0; i < itemText.length; i++) {
                  if (yPosition > pageHeight - 30) {
                    pdf.addPage();
                    addWatermark(pdf.internal.getNumberOfPages());
                    yPosition = 20;
                  }
                  pdf.setFontSize(10); // Ensure correct font size
                  pdf.setFont(undefined, 'normal');
                  pdf.setTextColor(0, 0, 0); // Force black color before each line
                  pdf.text(itemText[i], 20, yPosition);
                  yPosition += 6; // Increased line spacing for better readability
                }
              }
              
              yPosition += 10; // Increased space between items
            }
          }
        } else {
          // Format as regular paragraphs
          const paragraphs = topicsContent.split(/\n\s*\n/);
          
          for (let paragraph of paragraphs) {
            if (paragraph.trim()) {
              pdf.setFontSize(10);
              pdf.setFont(undefined, 'normal');
              pdf.setTextColor(0, 0, 0); // Ensure dark color
              const paragraphText = pdf.splitTextToSize(paragraph.trim(), pageWidth - 40);
              
              for (let i = 0; i < paragraphText.length; i++) {
                if (yPosition > pageHeight - 30) {
                  pdf.addPage();
                  addWatermark(pdf.internal.getNumberOfPages());
                  yPosition = 20;
                }
                pdf.setFontSize(10); // Ensure correct font size
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(0, 0, 0); // Force black color before each line
                pdf.text(paragraphText[i], 20, yPosition);
                yPosition += 6; // Increased line spacing for better readability
              }
              
              yPosition += 10; // Increased space between paragraphs
            }
          }
        }
      }

      // Exercises & Activities
      if (note.exercises) {
        pdf.addPage();
        addWatermark(pdf.internal.getNumberOfPages());
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text('Exercises & Activities', 20, yPosition);
        yPosition += 15;
        
        // Format exercises with better structure
        const exercisesContent = note.exercises;
        
        // Check if content has structured format (bullet points, numbers, etc.)
        const hasBullets = exercisesContent.includes('•') || exercisesContent.includes('-') || exercisesContent.includes('*');
        const hasNumbers = /\d+\./.test(exercisesContent);
        const hasExerciseMarkers = /Exercise|EXERCISE|Activity|ACTIVITY/i.test(exercisesContent);
        
        if (hasExerciseMarkers) {
          // Split by exercise/activity markers
          const exerciseSections = exercisesContent.split(/(?=Exercise \d+|EXERCISE \d+|Activity \d+|ACTIVITY \d+)/i);
          
          for (let section of exerciseSections) {
            if (section.trim()) {
              const isExerciseHeader = /^(Exercise \d+|EXERCISE \d+|Activity \d+|ACTIVITY \d+)/i.test(section.trim());
              
              if (isExerciseHeader) {
                // Format as exercise header
                const lines = section.trim().split('\n');
                const headerLine = lines[0];
                const contentLines = lines.slice(1).join('\n');
                
                if (yPosition > pageHeight - 40) {
                  pdf.addPage();
                  addWatermark(pdf.internal.getNumberOfPages());
                  yPosition = 20;
                }
                
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.text(headerLine, 20, yPosition);
                yPosition += 12;
                
                // Add exercise content
                if (contentLines.trim()) {
                  pdf.setFontSize(10);
                  pdf.setFont(undefined, 'normal');
                  const contentText = pdf.splitTextToSize(contentLines, pageWidth - 40);
                  
                  for (let i = 0; i < contentText.length; i++) {
                    if (yPosition > pageHeight - 30) {
                      pdf.addPage();
                      addWatermark(pdf.internal.getNumberOfPages());
                      yPosition = 20;
                    }
                    pdf.text(contentText[i], 20, yPosition);
                    yPosition += 6; // Increased line spacing for better readability
                  }
                }
                
                yPosition += 10; // Space between exercises
              } else {
                // Regular content
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                const contentText = pdf.splitTextToSize(section, pageWidth - 40);
                
                for (let i = 0; i < contentText.length; i++) {
                  if (yPosition > pageHeight - 30) {
                    pdf.addPage();
                    addWatermark(pdf.internal.getNumberOfPages());
                    yPosition = 20;
                  }
                  pdf.text(contentText[i], 20, yPosition);
                  yPosition += 6; // Increased line spacing for better readability
                }
                
                yPosition += 6; // Increased line spacing for better readability
              }
            }
          }
        } else if (hasBullets || hasNumbers) {
          // Format as bulleted or numbered list
          const items = exercisesContent.split(/(?=•|-\s|\*\s|\d+\.)/).filter(item => item.trim());
          
          for (let item of items) {
            if (item.trim()) {
              pdf.setFontSize(10);
              pdf.setFont(undefined, 'normal');
              const itemText = pdf.splitTextToSize(item.trim(), pageWidth - 40);
              
              for (let i = 0; i < itemText.length; i++) {
                if (yPosition > pageHeight - 30) {
                  pdf.addPage();
                  addWatermark(pdf.internal.getNumberOfPages());
                  yPosition = 20;
                }
                pdf.text(itemText[i], 20, yPosition);
                yPosition += 6; // Increased line spacing for better readability
              }
              
              yPosition += 10; // Increased space between items
            }
          }
        } else {
          // Format as regular paragraphs
          const paragraphs = exercisesContent.split(/\n\s*\n/);
          
          for (let paragraph of paragraphs) {
            if (paragraph.trim()) {
              pdf.setFontSize(10);
              pdf.setFont(undefined, 'normal');
              const paragraphText = pdf.splitTextToSize(paragraph.trim(), pageWidth - 40);
              
              for (let i = 0; i < paragraphText.length; i++) {
                if (yPosition > pageHeight - 30) {
                  pdf.addPage();
                  addWatermark(pdf.internal.getNumberOfPages());
                  yPosition = 20;
                }
                pdf.setFontSize(10); // Ensure correct font size
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(0, 0, 0); // Force black color before each line
                pdf.text(paragraphText[i], 20, yPosition);
                yPosition += 6; // Increased line spacing for better readability
              }
              
              yPosition += 10; // Increased space between paragraphs
            }
          }
        }
      }

      // Additional Resources
      if (note.resources) {
        pdf.addPage();
        addWatermark(pdf.internal.getNumberOfPages());
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.text('Additional Resources', 20, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        const resourceLines = pdf.splitTextToSize(note.resources, pageWidth - 40);
        pdf.text(resourceLines, 20, yPosition);
        yPosition += resourceLines.length * 5 + 15;
      }

      // Bibliography
      if (note.bibliography) {
        pdf.addPage();
        addWatermark(pdf.internal.getNumberOfPages());
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.text('Bibliography & References', 20, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        const bibLines = pdf.splitTextToSize(note.bibliography, pageWidth - 40);
        pdf.text(bibLines, 20, yPosition);
      }

    } else {
      // Clinical Note PDF Generation
      addWatermark(1);
      
      // Header
      pdf.setFontSize(18);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 0, 0); // Ensure dark color
      pdf.text(note.noteType ? `${note.noteType.charAt(0).toUpperCase() + note.noteType.slice(1)} Note` : 'Session Note', 20, yPosition);
      yPosition += 15;

      // Meta information
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0); // Ensure dark color
      pdf.text(`Date: ${formatDate(note.createdAt)}`, 20, yPosition);
      yPosition += 8;
      
      if (note.therapistName) {
        pdf.text(`Therapist: ${note.therapistName}`, 20, yPosition);
        yPosition += 8;
      }

      if (note.sessionDate) {
        pdf.setTextColor(0, 0, 0); // Ensure dark color
        pdf.text(`Session Date: ${formatDate(note.sessionDate)}`, 20, yPosition);
        yPosition += 8;
      }

      // Note content fields
      const noteFields = ['subjective', 'objective', 'assessment', 'plan', 'interventions', 'clientResponse', 'moodRating', 'riskAssessment', 'nextSteps'];
      
      for (const field of noteFields) {
        if (note[field]) {
          pdf.addPage();
          addWatermark(pdf.internal.getNumberOfPages());
          yPosition = 20;
          
          pdf.setFontSize(14);
          pdf.setFont(undefined, 'bold');
          pdf.setTextColor(0, 0, 0); // Ensure dark color for headers
          pdf.text(field.charAt(0).toUpperCase() + field.slice(1), 20, yPosition);
          yPosition += 12;
          
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
          const contentLines = pdf.splitTextToSize(note[field], pageWidth - 40);
          
          for (let i = 0; i < contentLines.length; i++) {
            if (yPosition > pageHeight - 30) {
              pdf.addPage();
              addWatermark(pdf.internal.getNumberOfPages());
              yPosition = 20;
            }
            pdf.setFontSize(10); // Ensure correct font size
            pdf.setFont(undefined, 'normal');
            pdf.setTextColor(0, 0, 0); // Force black color before each line
            pdf.text(contentLines[i], 20, yPosition);
            yPosition += 6; // Increased line spacing for better readability
          }
        }
      }

      // Signature
      if (note.signature) {
        pdf.addPage();
        addWatermark(pdf.internal.getNumberOfPages());
        yPosition = 20;
        
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 0, 0); // Ensure dark color for headers
        pdf.text('Digital Signature', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
        pdf.text(note.signature, 20, yPosition);
      }
    }

    // Footer with page number for all pages
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0); // Pure black for maximum visibility
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth - 30, pageHeight - 10);
      pdf.text('NessaHub', 20, pageHeight - 10);
    }

    const fileName = note.noteType === 'therapyBook' 
      ? `${note.bookTitle?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'therapy_book'}`
      : `note_${note.noteType || 'session_note'}`;
    
    pdf.save(`${fileName}.pdf`);
  };

  // Handle download
  const handleViewNote = (note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const handleDownload = (item) => {
    if (item.type === 'note') {
      generateNotePDF(item);
    } else if (item.type === 'resource' || item.type === 'assigned' || item.type === 'public') {
      generateResourcePDF(item);
    }
  };

  if (isLoading) {
    return (
      <div className="resources-loading">
        <div className="loading-spinner"></div>
        <p>Loading resources...</p>
      </div>
    );
  }

  return (
    <div className="client-resources">
      <div className="resources-header">
        <div className="header-content">
          <h1 className="page-title">Resources & Self-Help</h1>
          <p className="subtitle">Tools and materials to support your therapy journey</p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={20} />
            </button>
            <button 
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="resources-controls">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="category-filters">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <category.icon size={16} />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Resources Grid/List */}
      {filteredResources.length === 0 ? (
        <div className="no-resources">
          <BookOpen size={48} />
          <h3>No resources found</h3>
          <p>
            {searchTerm || selectedCategory !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'No resources available at the moment'
            }
          </p>
        </div>
      ) : (
        <div className={`resources-container ${viewMode}`}>
          {filteredResources.map((item) => (
            <div key={item.id} className="resource-card">
              <div className="resource-header">
                <div className="resource-icon">
                  {getResourceIcon(item)}
                </div>
                <div className="resource-meta">
                  <div className="resource-type">
                    <span className={`type-badge ${getResourceTypeColor(item)}`}>
                      {item.type === 'worksheet' ? 'Worksheet' : 
                       item.type === 'assigned' ? 'Assigned' : 
                       item.type === 'public' ? 'Public' : 
                       item.type === 'note' ? (item.noteType === 'therapyBook' ? 'Therapy Book' : 'Clinical Note') : 'Resource'}
                    </span>
                    {item.type === 'worksheet' ? (
                      <span className="category-badge">
                        {item.category}
                      </span>
                    ) : item.category && (
                      <span className="category-badge">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <div className="resource-date">
                    <Clock size={14} />
                    {formatDate(item.createdAt || item.dateCreated)}
                  </div>
                </div>
                <div className="resource-actions">
                  <button 
                    className={`action-btn ${favorites.includes(item.id) ? 'favorited' : ''}`}
                    onClick={() => toggleFavorite(item.id)}
                    title={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart size={16} />
                  </button>
                  <button className="action-btn" title="Share">
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="resource-content">
                <h3 className="resource-title">
                  {item.type === 'note' && item.noteType === 'therapyBook' 
                    ? item.bookTitle 
                    : item.title || (item.noteType ? `${item.noteType.charAt(0).toUpperCase() + item.noteType.slice(1)} Note` : 'Note')
                  }
                </h3>
                {item.type !== 'note' && (
                  <p className="resource-description">
                    {item.description?.substring(0, 100) + '...'}
                  </p>
                )}
                
                {item.type === 'worksheet' && item.goal && (
                  <div className="worksheet-goal">
                    <strong>Goal:</strong> {item.goal}
                    {hasUpdates(item) && (
                      <span className="update-indicator">
                        <AlertCircle size={14} />
                        Updated with new fields
                      </span>
                    )}
                  </div>
                )}

                {item.type === 'note' && item.noteType === 'therapyBook' && (
                  <div className="note-meta">
                    {item.author && <div><strong>Author:</strong> {item.author}</div>}
                    {item.targetAudience && <div><strong>Target:</strong> {item.targetAudience}</div>}
                    {item.difficultyLevel && <div><strong>Level:</strong> {item.difficultyLevel}</div>}
                  </div>
                )}

                {item.type === 'note' && item.noteType === 'clinical' && (
                  <div className="note-meta">
                    {item.therapistName && <div><strong>Therapist:</strong> {item.therapistName}</div>}
                    {item.sessionDate && <div><strong>Session Date:</strong> {formatDate(item.sessionDate)}</div>}
                  </div>
                )}
                
                {item.tags && item.tags.length > 0 && (
                  <div className="resource-tags">
                    {item.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="resource-footer">
                <div className="resource-stats">
                  {item.type === 'worksheet' ? (
                    <>
                      <span className="stat">
                        <Target size={14} />
                        {item.fields?.length || 0} questions
                      </span>
                      <span className="stat">
                        <CheckCircle size={14} />
                        {item.allowMultipleResponses ? 'Multiple attempts' : 'Single attempt'}
                      </span>
                    </>
                  ) : item.type === 'note' ? (
                    <>
                    <span className="stat">
                      <Clock size={14} />
                        {formatDate(item.createdAt)}
                      </span>
                      {item.noteType === 'therapyBook' && item.difficultyLevel && (
                        <span className="stat">
                          <Star size={14} />
                          {item.difficultyLevel}
                    </span>
                  )}
                      {item.noteType === 'clinical' && item.noteType && (
                    <span className="stat">
                      <Star size={14} />
                          {item.noteType.toUpperCase()}
                    </span>
                      )}
                    </>
                  ) : (
                    <>
                      {item.duration && (
                    <span className="stat">
                      <Clock size={14} />
                          {item.duration}
                    </span>
                  )}
                      {item.difficulty && (
                    <span className="stat">
                      <Star size={14} />
                          {item.difficulty}
                    </span>
                      )}
                    </>
                  )}
                </div>
                
                <div className="resource-buttons">
                  {item.type === 'worksheet' ? (
                    <button 
                      className={`btn-primary ${isWorksheetCompleted(item) ? 'completed' : hasNewFields(item) ? 'updated' : ''}`}
                      onClick={() => handleWorksheetView(item)}
                    >
                      <ClipboardList size={16} />
                      {isWorksheetCompleted(item) 
                        ? 'Completed' 
                        : hasNewFields(item) 
                          ? 'Complete New Fields' 
                          : 'Complete'
                      }
                    </button>
                  ) : item.type === 'note' ? (
                    <>
                      <button 
                        className="btn-secondary" 
                        onClick={() => handleViewNote(item)}
                        data-tooltip="View Note"
                        title="View Note"
                      >
                        <Eye size={16} />
                        <span>View</span>
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={() => handleDownload(item)}
                        data-tooltip="Download PDF"
                        title="Download PDF"
                      >
                        <Download size={16} />
                        <span>Download PDF</span>
                      </button>
                    </>
                  ) : item.type === 'resource' || item.type === 'assigned' || item.type === 'public' ? (
                    <button 
                      className="btn-primary" 
                      onClick={() => handleDownload(item)}
                      data-tooltip="Download PDF"
                      title="Download PDF"
                    >
                      <Download size={16} />
                      <span>Download PDF</span>
                    </button>
                  ) : item.category === 'videos' ? (
                    <button 
                      className="btn-primary"
                      data-tooltip="Watch Video"
                      title="Watch Video"
                    >
                      <Play size={16} />
                      <span>Watch</span>
                    </button>
                  ) : (
                    <button 
                      className="btn-primary"
                      data-tooltip="View"
                      title="View"
                    >
                      <Eye size={16} />
                      <span>View</span>
                    </button>
                  )}
                  
                  {item.fileUrl && (
                    <button 
                      className="btn-secondary"
                      data-tooltip="Download File"
                      title="Download File"
                    >
                      <Download size={16} />
                      <span>Download File</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <div className="favorites-section">
          <h2 className="section-title">
            <Heart size={24} />
            Your Favorites
          </h2>
          <div className="favorites-grid">
            {resources
              .filter(resource => favorites.includes(resource.id))
              .slice(0, 6)
              .map((resource) => (
                <div key={resource.id} className="favorite-card">
                  <div className="favorite-icon">
                    {getResourceIcon(resource.category)}
                  </div>
                  <div className="favorite-content">
                    <h4>{resource.title}</h4>
                    <p>{resource.category}</p>
                  </div>
                  <button 
                    className="favorite-remove"
                    onClick={() => toggleFavorite(resource.id)}
                  >
                    <Heart size={16} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Worksheet Modal */}
      {showWorksheetModal && selectedWorksheet && (
        <div className="modal-overlay" onClick={() => setShowWorksheetModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedWorksheet.title}</h2>
              <button 
                className="close-button"
                onClick={() => setShowWorksheetModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="worksheet-view">
                {/* Worksheet Header */}
                <div className="worksheet-header">
                  <div className="worksheet-meta">
                    <div className="meta-item">
                      <Target size={16} />
                      <span>Goal: {selectedWorksheet.goal}</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>{selectedWorksheet.fields?.length || 0} questions</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedWorksheet.description && (
                  <div className="worksheet-section">
                    <h3>Instructions</h3>
                    <div className="instructions-box">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selectedWorksheet.description}</p>
                    </div>
                  </div>
                )}

                {/* Additional Instructions */}
                {selectedWorksheet.instructions && (
                  <div className="worksheet-section">
                    <h3>Additional Instructions</h3>
                    <div className="instructions-box">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selectedWorksheet.instructions}</p>
                    </div>
                  </div>
                )}

                {/* Fields */}
                {selectedWorksheet.fields && selectedWorksheet.fields.length > 0 && (
                  <div className="worksheet-section">
                    <h3>Questions</h3>
                    <div className="fields-list">
                      {selectedWorksheet.fields.map((field, index) => {
                        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                        const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                        const hasExistingResponse = clientResponse?.responses && clientResponse.responses[index] !== undefined;
                        const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
                        const fieldResponse = worksheetResponses[index];
                        
                        // Field is editable if:
                        // 1. No existing response for this field, OR
                        // 2. There are new fields and this field is beyond the original field count
                        const isEditable = !hasExistingResponse || (hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length));
                        const isNewField = hasNewFields && index >= (Object.keys(clientResponse?.responses || {}).length);
                        
                        return (
                          <div key={index} className={`field-item ${!isEditable ? 'completed' : ''} ${isNewField ? 'new-field' : ''}`}>
                            <div className="field-header">
                              <h4>{field.name}</h4>
                              {field.required && <span className="required-badge">Required</span>}
                              {!isEditable && hasExistingResponse && <span className="completed-badge">Completed</span>}
                              {isNewField && <span className="new-field-badge">New Field</span>}
                            </div>
                            
                            {!isEditable && hasExistingResponse && (
                              <div className="field-response">
                                <strong>Your Answer:</strong>
                                <div className="response-value">
                                  {(() => {
                                    // Get the existing response from clientResponse.responses
                                    const existingAnswer = clientResponse.responses[index];
                                    if (existingAnswer !== undefined) {
                                      return Array.isArray(existingAnswer) ? existingAnswer.join(', ') : existingAnswer.toString();
                                    }
                                    return 'No answer provided';
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Show feedback if available */}
                            {clientResponse?.feedback && (
                              <div className="therapist-feedback">
                                <strong>Therapist Feedback:</strong>
                                <div className="feedback-content">
                                  <div className="feedback-rating">
                                    Rating: {clientResponse.feedback.rating}/10
                                  </div>
                                  <div className="feedback-text">
                                    {clientResponse.feedback.feedback}
                                  </div>
                                  <div className="feedback-date">
                                    {clientResponse.feedback.givenAt?.toDate?.()?.toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div className={`field-input ${!isEditable ? 'disabled' : ''}`}>
                            {field.type === 'text' && (
                              <input
                                type="text"
                                value={(() => {
                                  // For completed fields, show existing answer, otherwise show current input
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter your answer..."
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'textarea' && (
                              <textarea
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter your detailed answer..."
                                rows={4}
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'number' && (
                              <input
                                type="number"
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                placeholder="Enter a number..."
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'date' && (
                              <input
                                type="date"
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                disabled={!isEditable}
                              />
                            )}
                            
                            {field.type === 'select' && (
                              <select
                                value={(() => {
                                  if (!isEditable && hasExistingResponse) {
                                    const existingAnswer = clientResponse.responses[index];
                                    return existingAnswer !== undefined ? existingAnswer.toString() : '';
                                  }
                                  return worksheetResponses[index] || '';
                                })()}
                                onChange={(e) => handleResponseChange(index, e.target.value)}
                                disabled={!isEditable}
                              >
                                <option value="">Select an option...</option>
                                {field.options && field.options.map((option, optIndex) => (
                                  <option key={optIndex} value={option}>{option}</option>
                                ))}
                              </select>
                            )}
                            
                            {field.type === 'radio' && (
                              <div className="radio-group">
                                {field.options && field.options.map((option, optIndex) => (
                                  <label key={optIndex} className="radio-option">
                                    <input
                                      type="radio"
                                      name={`field_${index}`}
                                      value={option}
                                      checked={(() => {
                                        if (!isEditable && hasExistingResponse) {
                                          const existingAnswer = clientResponse.responses[index];
                                          return existingAnswer === option;
                                        }
                                        return worksheetResponses[index] === option;
                                      })()}
                                      onChange={(e) => handleResponseChange(index, e.target.value)}
                                      disabled={!isEditable}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            
                            {field.type === 'checkbox' && (
                              <label className="checkbox-option">
                                <input
                                  type="checkbox"
                                  checked={(() => {
                                    if (!isEditable && hasExistingResponse) {
                                      const existingAnswer = clientResponse.responses[index];
                                      return existingAnswer === true;
                                    }
                                    return worksheetResponses[index] || false;
                                  })()}
                                  onChange={(e) => handleResponseChange(index, e.target.checked)}
                                  disabled={!isEditable}
                                />
                                <span>I agree</span>
                              </label>
                            )}
                            
                            {field.type === 'rating' && (
                              <div className="rating-group">
                                <div className="rating-scale">
                                  <span>1</span>
                                  {[1,2,3,4,5,6,7,8,9,10].map(num => (
                                    <label key={num} className="rating-option">
                                      <input
                                        type="radio"
                                        name={`rating_${index}`}
                                        value={num}
                                        checked={(() => {
                                          if (!isEditable && hasExistingResponse) {
                                            const existingAnswer = clientResponse.responses[index];
                                            return existingAnswer === num;
                                          }
                                          return worksheetResponses[index] === num;
                                        })()}
                                        onChange={(e) => handleResponseChange(index, parseInt(e.target.value))}
                                        disabled={!isEditable}
                                      />
                                      <span className="rating-dot">{num}</span>
                                    </label>
                                  ))}
                                  <span>10</span>
                                </div>
                              </div>
                            )}
                            
                            {field.type === 'multiple-choice' && (
                              <div className="multiple-choice-group">
                                {field.options && field.options.map((option, optIndex) => (
                                  <label key={optIndex} className="checkbox-option">
                                    <input
                                      type="checkbox"
                                      checked={(worksheetResponses[index] || []).includes(option)}
                                      onChange={(e) => {
                                        const currentValues = worksheetResponses[index] || [];
                                        const newValues = e.target.checked
                                          ? [...currentValues, option]
                                          : currentValues.filter(v => v !== option);
                                        handleResponseChange(index, newValues);
                                      }}
                                      disabled={!isEditable}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
    </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetModal(false)}
              >
                {(() => {
                  const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                  const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                  return clientResponse?.status === 'completed' ? 'Close' : 'Cancel';
                })()}
              </button>
              {(() => {
                const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
                const clientResponse = selectedWorksheet.clientResponses?.[clientId];
                const hasNewFields = clientResponse?.needsToCompleteNewFields === true;
                const hasExistingResponse = clientResponse?.responses && Object.keys(clientResponse.responses).length > 0;
                
                // Show submit button if there are no existing responses OR if there are new fields to complete
                if (!hasExistingResponse || hasNewFields) {
                  return (
                    <button 
                      className="btn-primary"
                      onClick={handleSubmitWorksheet}
                    >
                      <Send size={16} />
                      {hasNewFields ? 'Submit New Fields' : 'Submit Worksheet'}
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Note View Modal */}
      {showNoteModal && selectedNote && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {selectedNote.noteType === 'therapyBook' 
                  ? selectedNote.bookTitle 
                  : `${selectedNote.noteType?.charAt(0).toUpperCase() + selectedNote.noteType?.slice(1)} Note`
                }
              </h2>
              <button 
                className="close-button"
                onClick={() => setShowNoteModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="note-view">
                {/* Note Header */}
                <div className="note-header">
                  <div className="note-meta">
                    {selectedNote.author && (
                      <div className="meta-item">
                        <User size={16} />
                        <span>Author: {selectedNote.author}</span>
                      </div>
                    )}
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>Created: {selectedNote.createdAt?.toDate?.()?.toLocaleDateString()}</span>
                    </div>
                    {selectedNote.targetAudience && (
                      <div className="meta-item">
                        <Target size={16} />
                        <span>Target: {selectedNote.targetAudience}</span>
                      </div>
                    )}
                    {selectedNote.difficultyLevel && (
                      <div className="meta-item">
                        <Star size={16} />
                        <span>Level: {selectedNote.difficultyLevel}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Therapy Book Content */}
                {selectedNote.noteType === 'therapyBook' && (
                  <>
                    {/* Description */}
                    {selectedNote.description && (
                      <div className="note-section">
                        <h3>Description</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Table of Contents */}
                    {selectedNote.tableOfContents && (
                      <div className="note-section">
                        <h3>Table of Contents</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.tableOfContents}</p>
                        </div>
                      </div>
                    )}

                    {/* Chapters */}
                    {selectedNote.chapters && (
                      <div className="note-section">
                        <h3>Chapters</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.chapters}</p>
                        </div>
                      </div>
                    )}

                    {/* Key Topics */}
                    {selectedNote.keyTopics && (
                      <div className="note-section">
                        <h3>Key Topics</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.keyTopics}</p>
                        </div>
                      </div>
                    )}

                    {/* Exercises */}
                    {selectedNote.exercises && (
                      <div className="note-section">
                        <h3>Exercises & Activities</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.exercises}</p>
                        </div>
                      </div>
                    )}

                    {/* Resources */}
                    {selectedNote.resources && (
                      <div className="note-section">
                        <h3>Additional Resources</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.resources}</p>
                        </div>
                      </div>
                    )}

                    {/* Bibliography */}
                    {selectedNote.bibliography && (
                      <div className="note-section">
                        <h3>Bibliography & References</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.bibliography}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Clinical Note Content */}
                {selectedNote.noteType !== 'therapyBook' && (
                  <>
                    {/* Note Content */}
                    {selectedNote.noteContent && (
                      <div className="note-section">
                        <h3>Note Content</h3>
                        <div className="note-content">
                          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote.noteContent}</p>
                        </div>
                      </div>
                    )}

                    {/* Session Date */}
                    {selectedNote.sessionDate && (
                      <div className="note-section">
                        <h3>Session Date</h3>
                        <div className="note-content">
                          <p>{selectedNote.sessionDate?.toDate?.()?.toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}

                    {/* Therapist Name */}
                    {selectedNote.therapistName && (
                      <div className="note-section">
                        <h3>Therapist</h3>
                        <div className="note-content">
                          <p>{selectedNote.therapistName}</p>
                        </div>
                      </div>
                    )}

                    {/* Note Fields */}
                    {['subjective', 'objective', 'assessment', 'plan', 'interventions', 'clientResponse', 'moodRating', 'riskAssessment', 'nextSteps'].map(field => {
                      if (selectedNote[field]) {
                        return (
                          <div key={field} className="note-section">
                            <h3>{field.charAt(0).toUpperCase() + field.slice(1)}</h3>
                            <div className="note-content">
                              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedNote[field]}</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}

                    {/* Signature */}
                    {selectedNote.signature && (
                      <div className="note-section">
                        <h3>Digital Signature</h3>
                        <div className="note-content">
                          <p>{selectedNote.signature}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowNoteModal(false)}
              >
                Close
              </button>
              <button 
                className="btn-primary"
                onClick={() => handleDownload(selectedNote)}
              >
                <Download size={16} />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
