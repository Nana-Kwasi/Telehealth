import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  FileText, 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  GraduationCap, 
  Video, 
  Download, 
  Upload, 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Star,
  Clock,
  Tag,
  Play,
  File,
  Image,
  Link,
  Settings,
  Shield,
  DollarSign,
  Award,
  Target,
  Heart,
  Brain,
  Zap,
  MessageCircle,
  Save,
  Send
} from 'lucide-react';
import jsPDF from 'jspdf';
import { auth, db } from '../../Auth/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import './Resources.css';

export default function TherapistResources() {
  const [activeTab, setActiveTab] = useState('resources');
  const [resources, setResources] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  const [showClientSelection, setShowClientSelection] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [assignedClients, setAssignedClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [allTherapists, setAllTherapists] = useState([]);
  const [selectedTherapists, setSelectedTherapists] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [therapistNames, setTherapistNames] = useState({});
  const [clientNames, setClientNames] = useState({});
  const [showWorksheetModal, setShowWorksheetModal] = useState(false);
  const [showWorksheetViewModal, setShowWorksheetViewModal] = useState(false);
  const [showWorksheetEditModal, setShowWorksheetEditModal] = useState(false);
  const [showResourceViewModal, setShowResourceViewModal] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [selectedResourceForView, setSelectedResourceForView] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedClientForFeedback, setSelectedClientForFeedback] = useState(null);
  const [worksheetForm, setWorksheetForm] = useState({
    title: '',
    description: '',
    goal: '',
    instructions: '',
    category: 'CBT',
    type: 'patient-facing',
    status: 'active',
    fields: [],
    allowMultipleResponses: true,
    assignedTo: []
  });

  const [editWorksheetForm, setEditWorksheetForm] = useState({
    title: '',
    description: '',
    goal: '',
    instructions: '',
    category: 'CBT',
    type: 'patient-facing',
    status: 'active',
    fields: [],
    allowMultipleResponses: true,
    assignedTo: []
  });

  const [feedbackForm, setFeedbackForm] = useState({
    feedback: '',
    rating: 5
  });
  const [resourceForm, setResourceForm] = useState({
    title: '',
    description: '',
    category: 'homework',
    type: 'document',
    content: '',
    tags: [],
    difficulty: 'beginner',
    duration: '',
    targetAudience: 'all',
    isPublic: true,
    fileUrl: '',
    fileName: '',
    fileSize: '',
    linkUrl: '',
    selectedClients: [],
    // Category-specific fields
    exercises: '',
    instructions: '',
    completionTime: '',
    materialsNeeded: '',
    learningObjectives: '',
    keyConcepts: '',
    additionalReading: '',
    discussionQuestions: '',
    resourceType: '',
    location: '',
    contactInfo: '',
    availability: '',
    eligibility: '',
    cost: '',
    crisisType: '',
    urgencyLevel: '',
    safetyPlan: '',
    followUpSteps: '',
    warningSigns: '',
    assessmentType: '',
    scoringMethod: '',
    interpretation: '',
    validityInfo: '',
    ageRange: '',
    protocolType: '',
    evidenceBase: '',
    sessionCount: '',
    outcomeMeasures: '',
    contraindications: '',
    researchType: '',
    authors: '',
    publicationDate: '',
    journal: '',
    doi: '',
    abstract: '',
    keyFindings: '',
    trainingLevel: '',
    certification: '',
    prerequisites: '',
    learningOutcomes: '',
    ceuCredits: '',
    videoLength: '',
    instructor: '',
    topics: '',
    skillLevel: '',
    certificate: '',
    guidelineType: '',
    organization: '',
    lastUpdated: '',
    complianceLevel: '',
    implementation: '',
    monitoring: '',
    legalType: '',
    jurisdiction: '',
    effectiveDate: '',
    complianceRequirements: '',
    penalties: '',
    resources: ''
  });

  const currentUser = auth.currentUser;

  // Resource categories and types
  const categories = {
    homework: {
      name: 'Homework & Exercises',
      icon: BookOpen,
      color: 'blue',
      description: 'Client homework assignments and therapeutic exercises',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'exercises', 'instructions', 'completionTime', 'materialsNeeded']
    },
    psychoeducation: {
      name: 'Psychoeducational Materials',
      icon: Brain,
      color: 'green',
      description: 'Educational content for client understanding',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'learningObjectives', 'keyConcepts', 'additionalReading', 'discussionQuestions']
    },
    community: {
      name: 'Community Resources',
      icon: Users,
      color: 'purple',
      description: 'Local and online community support resources',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'resourceType', 'location', 'contactInfo', 'availability', 'eligibility', 'cost']
    },
    crisis: {
      name: 'Crisis Intervention',
      icon: AlertTriangle,
      color: 'red',
      description: 'Emergency protocols and crisis management tools',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'crisisType', 'urgencyLevel', 'contactInfo', 'safetyPlan', 'followUpSteps', 'warningSigns']
    },
    assessments: {
      name: 'Assessment Instruments',
      icon: ClipboardList,
      color: 'orange',
      description: 'Clinical assessment tools and questionnaires',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'assessmentType', 'scoringMethod', 'interpretation', 'validityInfo', 'ageRange']
    },
    protocols: {
      name: 'Treatment Protocols',
      icon: Target,
      color: 'indigo',
      description: 'Evidence-based treatment guidelines',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'protocolType', 'evidenceBase', 'sessionCount', 'outcomeMeasures', 'contraindications']
    },
    research: {
      name: 'Research & References',
      icon: FileText,
      color: 'gray',
      description: 'Clinical research and reference materials',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'researchType', 'authors', 'publicationDate', 'journal', 'doi', 'abstract', 'keyFindings']
    },
    education: {
      name: 'Continuing Education',
      icon: GraduationCap,
      color: 'pink',
      description: 'Professional development and training materials',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'trainingLevel', 'certification', 'prerequisites', 'learningOutcomes', 'ceuCredits']
    },
    videos: {
      name: 'Training Videos',
      icon: Video,
      color: 'teal',
      description: 'Video tutorials and training content',
      fields: ['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'videoLength', 'instructor', 'topics', 'skillLevel', 'certificate']
    },
    guidelines: {
      name: 'Best Practice Guidelines',
      icon: Award,
      color: 'emerald',
      description: 'Professional standards and best practices',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'guidelineType', 'organization', 'lastUpdated', 'complianceLevel', 'implementation', 'monitoring']
    },
    legal: {
      name: 'Legal & Ethical Guidelines',
      icon: Shield,
      color: 'slate',
      description: 'Legal compliance and ethical standards',
      fields: ['title', 'description', 'type', 'targetAudience', 'content', 'tags', 'legalType', 'jurisdiction', 'effectiveDate', 'complianceRequirements', 'penalties', 'resources']
    }
  };

  const resourceTypes = {
    document: { name: 'Document', icon: FileText },
    video: { name: 'Video', icon: Video },
    link: { name: 'Link', icon: Link },
    image: { name: 'Image', icon: Image },
    audio: { name: 'Audio', icon: Play }
  };

  const difficultyLevels = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced'
  };

  const targetAudiences = {
    all: 'All Clients',
    individuals: 'Individuals',
    teen: 'Teen',
    couples: 'Couples',
    specific: 'Specific Clients'
  };

  const targetAudienceTypes = {
    clients: 'Clients',
    therapists: 'Therapists'
  };

  const therapistAudienceOptions = {
    all: 'All Therapists',
    specific: 'Specific Therapists'
  };

  const worksheetCategories = {
    'CBT': 'Cognitive Behavioral Therapy',
    'DBT': 'Dialectical Behavior Therapy',
    'journaling': 'Journaling',
    'moodTracking': 'Mood Tracking',
    'mindfulness': 'Mindfulness',
    'anxiety': 'Anxiety Management',
    'depression': 'Depression Management',
    'trauma': 'Trauma Recovery',
    'relationships': 'Relationships',
    'selfCare': 'Self Care',
    'other': 'Other'
  };

  const worksheetTypes = {
    'patient-facing': 'Patient-Facing',
  };

  const worksheetStatuses = {
    'active': 'Active',
    'archived': 'Archived'
  };

  // Check if user is admin
  useEffect(() => {
    if (!currentUser) return;

    const checkAdminStatus = async () => {
      try {
        const therapistDoc = await getDocs(query(
          collection(db, 'therapists'),
          where('__name__', '==', currentUser.uid)
        ));
        
        if (!therapistDoc.empty) {
          const therapistData = therapistDoc.docs[0].data();
          setIsAdmin(therapistData.role === 'admin' || therapistData.isAdmin === true);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [currentUser]);

  // Fetch all resources
  useEffect(() => {
    if (!currentUser) return;

    const resourcesQuery = query(
      collection(db, 'therapistResources'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(resourcesQuery, async (snap) => {
      const resourcesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter resources based on admin status
      const filteredResources = isAdmin 
        ? resourcesData 
        : resourcesData.filter(resource => resource.therapistId === currentUser.uid);
      
      setResources(filteredResources);
      
      // Fetch therapist names for all unique therapist IDs
      const uniqueTherapistIds = [...new Set(filteredResources.map(resource => resource.therapistId))];
      await fetchTherapistNames(uniqueTherapistIds);
    });

    return unsubscribe;
  }, [currentUser, isAdmin]);

  // Fetch worksheets function
  const fetchWorksheets = async () => {
    if (!currentUser) return;

    try {
      const worksheetsQuery = query(
        collection(db, 'worksheets'),
        orderBy('dateCreated', 'desc')
      );

      const snap = await getDocs(worksheetsQuery);
      const worksheetsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter worksheets based on admin status
      const filteredWorksheets = isAdmin 
        ? worksheetsData 
        : worksheetsData.filter(worksheet => worksheet.createdBy === currentUser.uid);
      
      setWorksheets(filteredWorksheets);
      
      // Fetch therapist names for all unique therapist IDs
      const uniqueTherapistIds = [...new Set(filteredWorksheets.map(worksheet => worksheet.createdBy))];
      await fetchTherapistNames(uniqueTherapistIds);
    } catch (error) {
      console.error('Error fetching worksheets:', error);
    }
  };

  // Fetch all worksheets
  useEffect(() => {
    if (!currentUser) return;

    const worksheetsQuery = query(
      collection(db, 'worksheets'),
      orderBy('dateCreated', 'desc')
    );

    const unsubscribe = onSnapshot(worksheetsQuery, async (snap) => {
      const worksheetsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter worksheets based on admin status
      const filteredWorksheets = isAdmin 
        ? worksheetsData 
        : worksheetsData.filter(worksheet => worksheet.createdBy === currentUser.uid);
      
      setWorksheets(filteredWorksheets);
      
      // Fetch therapist names for all unique therapist IDs
      const uniqueTherapistIds = [...new Set(filteredWorksheets.map(worksheet => worksheet.createdBy))];
      await fetchTherapistNames(uniqueTherapistIds);
    });

    return unsubscribe;
  }, [currentUser, isAdmin]);

  // Fetch therapist names by IDs
  const fetchTherapistNames = async (therapistIds) => {
    try {
      const therapistPromises = therapistIds.map(async (therapistId) => {
        if (therapistNames[therapistId]) return; // Already cached
        
        const therapistQuery = query(
          collection(db, 'therapists'),
          where('__name__', '==', therapistId)
        );
        const therapistSnap = await getDocs(therapistQuery);
        
        if (!therapistSnap.empty) {
          const therapistData = therapistSnap.docs[0].data();
          return {
            id: therapistId,
            name: therapistData.displayName || therapistData.name || 'Unknown Therapist'
          };
        }
        return { id: therapistId, name: 'Unknown Therapist' };
      });
      
      const therapistData = await Promise.all(therapistPromises);
      const namesMap = {};
      therapistData.forEach(therapist => {
        if (therapist) {
          namesMap[therapist.id] = therapist.name;
        }
      });
      
      setTherapistNames(prev => ({ ...prev, ...namesMap }));
    } catch (error) {
      console.error('Error fetching therapist names:', error);
    }
  };

  // Fetch client names for display
  const fetchClientNames = async (clientIds) => {
    try {
      const clientPromises = clientIds.map(async (clientId) => {
        if (clientNames[clientId]) return; // Already cached
        
        const clientQuery = query(
          collection(db, 'clients'),
          where('__name__', '==', clientId)
        );
        const clientSnap = await getDocs(clientQuery);
        
        if (!clientSnap.empty) {
          const clientData = clientSnap.docs[0].data();
          return {
            id: clientId,
            name: clientData.displayName || clientData.name || clientData.email || 'Unknown Client'
          };
        }
        return { id: clientId, name: 'Unknown Client' };
      });
      
      const clientData = await Promise.all(clientPromises);
      const namesMap = {};
      clientData.forEach(client => {
        if (client) {
          namesMap[client.id] = client.name;
        }
      });
      
      setClientNames(prev => ({ ...prev, ...namesMap }));
    } catch (error) {
      console.error('Error fetching client names:', error);
    }
  };

  // Fetch all clients and therapists for selection
  useEffect(() => {
    if (!currentUser) return;

    const fetchClients = async () => {
      try {
        // Get assigned client IDs from therapist's subcollection (same as Home component)
        const therapistClientsCol = collection(db, 'therapists', currentUser.uid, 'clients');
        const therapistClientsSnap = await getDocs(therapistClientsCol);
        const assignedClientIds = therapistClientsSnap.docs.map(doc => doc.data().clientId);
        
        console.log('🔍 Resources - Assigned client IDs:', assignedClientIds);
        
        // Get all clients from main collection
        const allClientsSnap = await getDocs(collection(db, 'clients'));
        const allClientsData = allClientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filter assigned clients
        const assignedClientsData = allClientsData.filter(client => assignedClientIds.includes(client.id));
        const otherClientsData = allClientsData.filter(client => !assignedClientIds.includes(client.id));
        
        console.log('🔍 Resources - Assigned clients:', assignedClientsData);
        console.log('🔍 Resources - Other clients:', otherClientsData);
        
        setAssignedClients(assignedClientsData);
        setAllClients(otherClientsData);
      } catch (error) {
        console.error('Error fetching clients:', error);
      }
    };

    // Fetch all therapists
    const allTherapistsQuery = query(collection(db, 'therapists'));
    const allTherapistsUnsub = onSnapshot(allTherapistsQuery, (snapshot) => {
      const allTherapistsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isAssigned: false
      }));
      setAllTherapists(allTherapistsData);
    });

    fetchClients();

    return () => {
      allTherapistsUnsub();
    };
  }, [currentUser]);

  // Handle file upload
  const handleFileUpload = async (file) => {
    try {
      // In a real implementation, you would upload to Firebase Storage
      // For now, we'll store the file info
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file) // Temporary URL for preview
      };
      
      setSelectedFile(file);
      setFilePreview(fileInfo.url);
      setResourceForm(prev => ({
        ...prev,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        fileUrl: fileInfo.url
      }));
    } catch (error) {
      console.error('Error handling file:', error);
      alert('Error processing file. Please try again.');
    }
  };

  const handleCreateResource = async () => {
    try {
      // Get only the relevant fields for the selected category
      const categoryFields = categories[resourceForm.category]?.fields || [];
      const relevantFields = {};
      
      // Add basic fields that are always included
      const basicFields = ['title', 'description', 'category', 'type', 'content', 'tags', 'difficulty', 'duration', 'targetAudience', 'isPublic'];
      
      // Add basic fields
      basicFields.forEach(field => {
        if (resourceForm[field] !== undefined) {
          relevantFields[field] = resourceForm[field];
        }
      });
      
      // Add category-specific fields
      categoryFields.forEach(field => {
        if (resourceForm[field] !== undefined && resourceForm[field] !== '') {
          relevantFields[field] = resourceForm[field];
        }
      });
      
      // Add type-specific fields
      if (resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') {
        if (selectedFile) {
          relevantFields.fileUrl = filePreview;
          relevantFields.fileName = selectedFile.name;
          relevantFields.fileSize = selectedFile.size;
          relevantFields.fileType = selectedFile.type;
        }
      } else if (resourceForm.type === 'link') {
        if (resourceForm.linkUrl) {
          relevantFields.linkUrl = resourceForm.linkUrl;
        }
      }

      const resourceData = {
        ...relevantFields,
        therapistId: currentUser.uid,
        therapistName: currentUser.displayName || 'Therapist',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        downloads: 0,
        rating: 0,
        reviews: []
      };

      // Handle different resource types
      if (resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') {
        if (!selectedFile) {
          alert('Please select a file for this resource type.');
          return;
        }
        // In production, upload to Firebase Storage and get download URL
        resourceData.fileUrl = filePreview;
        resourceData.fileName = selectedFile.name;
        resourceData.fileSize = selectedFile.size;
        resourceData.fileType = selectedFile.type;
      } else if (resourceForm.type === 'link') {
        if (!resourceForm.linkUrl) {
          alert('Please enter a URL for this link resource.');
          return;
        }
        resourceData.linkUrl = resourceForm.linkUrl;
      }

      await addDoc(collection(db, 'therapistResources'), resourceData);
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating resource:', error);
      alert('Error creating resource. Please try again.');
    }
  };

  const handleUpdateResource = async () => {
    try {
      const resourceData = {
        ...resourceForm,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'therapistResources', selectedResource.id), resourceData);
      setShowEditModal(false);
      setSelectedResource(null);
      resetForm();
    } catch (error) {
      console.error('Error updating resource:', error);
      alert('Error updating resource. Please try again.');
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (window.confirm('Are you sure you want to delete this resource?')) {
      try {
        await deleteDoc(doc(db, 'therapistResources', resourceId));
      } catch (error) {
        console.error('Error deleting resource:', error);
        alert('Error deleting resource. Please try again.');
      }
    }
  };

  const handleDeleteWorksheet = async (worksheetId) => {
    if (window.confirm('Are you sure you want to delete this worksheet?')) {
      try {
        await deleteDoc(doc(db, 'worksheets', worksheetId));
      } catch (error) {
        console.error('Error deleting worksheet:', error);
        alert('Error deleting worksheet. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setResourceForm({
      title: '',
      description: '',
      category: 'homework',
      type: 'document',
      content: '',
      tags: [],
      difficulty: 'beginner',
      duration: '',
      targetAudience: 'all',
      isPublic: true,
      fileUrl: '',
      fileName: '',
      fileSize: '',
      linkUrl: '',
      selectedClients: [],
      // Category-specific fields
      exercises: '',
      instructions: '',
      completionTime: '',
      materialsNeeded: '',
      learningObjectives: '',
      keyConcepts: '',
      additionalReading: '',
      discussionQuestions: '',
      resourceType: '',
      location: '',
      contactInfo: '',
      availability: '',
      eligibility: '',
      cost: '',
      crisisType: '',
      urgencyLevel: '',
      safetyPlan: '',
      followUpSteps: '',
      warningSigns: '',
      assessmentType: '',
      scoringMethod: '',
      interpretation: '',
      validityInfo: '',
      ageRange: '',
      protocolType: '',
      evidenceBase: '',
      sessionCount: '',
      outcomeMeasures: '',
      contraindications: '',
      researchType: '',
      authors: '',
      publicationDate: '',
      journal: '',
      doi: '',
      abstract: '',
      keyFindings: '',
      trainingLevel: '',
      certification: '',
      prerequisites: '',
      learningOutcomes: '',
      ceuCredits: '',
      videoLength: '',
      instructor: '',
      topics: '',
      skillLevel: '',
      certificate: '',
      guidelineType: '',
      organization: '',
      lastUpdated: '',
      complianceLevel: '',
      implementation: '',
      monitoring: '',
      legalType: '',
      jurisdiction: '',
      effectiveDate: '',
      complianceRequirements: '',
      penalties: '',
      resources: ''
    });
    setSelectedFile(null);
    setFilePreview('');
    setSelectedClients([]);
  };

  const openEditModal = (resource) => {
    setSelectedResource(resource);
    setResourceForm({
      title: resource.title || '',
      description: resource.description || '',
      category: resource.category || 'homework',
      type: resource.type || 'document',
      content: resource.content || '',
      tags: resource.tags || [],
      difficulty: resource.difficulty || 'beginner',
      duration: resource.duration || '',
      targetAudience: resource.targetAudience || 'all',
      isPublic: resource.isPublic !== false,
      fileUrl: resource.fileUrl || '',
      fileName: resource.fileName || '',
      fileSize: resource.fileSize || '',
      linkUrl: resource.linkUrl || '',
      selectedClients: resource.selectedClients || []
    });
    setShowEditModal(true);
  };

  // Client selection functions
  const handleClientSelection = (clientId) => {
    setSelectedClients(prev => {
      if (prev.includes(clientId)) {
        return prev.filter(id => id !== clientId);
      } else {
        return [...prev, clientId];
      }
    });
  };

  // Therapist selection functions
  const handleTherapistSelection = (therapistId) => {
    setSelectedTherapists(prev => {
      if (prev.some(t => t.id === therapistId)) {
        return prev.filter(t => t.id !== therapistId);
      } else {
        const therapist = allTherapists.find(t => t.id === therapistId);
        return therapist ? [...prev, therapist] : prev;
      }
    });
  };

  const handleSaveClientSelection = () => {
    console.log('Saving client selection:', { selectedClients, showWorksheetModal });
    
    // Check if we're in worksheet creation mode
    if (showWorksheetModal) {
      // For worksheets, update the assignedTo field
      console.log('Updating worksheet assignedTo with:', selectedClients);
      setWorksheetForm(prev => ({
        ...prev,
        assignedTo: selectedClients
      }));
    } else {
      // For resources, update the appropriate field based on target audience type
    if (resourceForm.targetAudienceType === 'therapists') {
      setResourceForm(prev => ({
        ...prev,
        selectedTherapists: selectedTherapists
      }));
    } else {
    setResourceForm(prev => ({
      ...prev,
      selectedClients: selectedClients
    }));
      }
    }
    setShowClientSelection(false);
  };

  // Function to render category-specific fields
  const renderCategoryFields = () => {
    const category = categories[resourceForm.category];
    if (!category || !category.fields) return null;

    const fieldLabels = {
      exercises: 'Exercises & Activities',
      instructions: 'Instructions',
      completionTime: 'Completion Time',
      materialsNeeded: 'Materials Needed',
      learningObjectives: 'Learning Objectives',
      keyConcepts: 'Key Concepts',
      additionalReading: 'Additional Reading',
      discussionQuestions: 'Discussion Questions',
      resourceType: 'Resource Type',
      location: 'Location',
      contactInfo: 'Contact Information',
      availability: 'Availability',
      eligibility: 'Eligibility Requirements',
      cost: 'Cost',
      crisisType: 'Crisis Type',
      urgencyLevel: 'Urgency Level',
      safetyPlan: 'Safety Plan',
      followUpSteps: 'Follow-up Steps',
      warningSigns: 'Warning Signs',
      assessmentType: 'Assessment Type',
      scoringMethod: 'Scoring Method',
      interpretation: 'Interpretation Guidelines',
      validityInfo: 'Validity Information',
      ageRange: 'Age Range',
      protocolType: 'Protocol Type',
      evidenceBase: 'Evidence Base',
      sessionCount: 'Number of Sessions',
      outcomeMeasures: 'Outcome Measures',
      contraindications: 'Contraindications',
      researchType: 'Research Type',
      authors: 'Authors',
      publicationDate: 'Publication Date',
      journal: 'Journal/Publication',
      doi: 'DOI',
      abstract: 'Abstract',
      keyFindings: 'Key Findings',
      trainingLevel: 'Training Level',
      certification: 'Certification',
      prerequisites: 'Prerequisites',
      learningOutcomes: 'Learning Outcomes',
      ceuCredits: 'CEU Credits',
      videoLength: 'Video Length',
      instructor: 'Instructor',
      topics: 'Topics Covered',
      skillLevel: 'Skill Level',
      certificate: 'Certificate Available',
      guidelineType: 'Guideline Type',
      organization: 'Organization',
      lastUpdated: 'Last Updated',
      complianceLevel: 'Compliance Level',
      implementation: 'Implementation Steps',
      monitoring: 'Monitoring Requirements',
      legalType: 'Legal Type',
      jurisdiction: 'Jurisdiction',
      effectiveDate: 'Effective Date',
      complianceRequirements: 'Compliance Requirements',
      penalties: 'Penalties',
      resources: 'Additional Resources'
    };

    const fieldPlaceholders = {
      exercises: 'List specific exercises and activities...',
      instructions: 'Provide detailed instructions...',
      completionTime: 'e.g., 15-20 minutes',
      materialsNeeded: 'List required materials...',
      learningObjectives: 'What should clients learn from this resource?',
      keyConcepts: 'Main concepts and ideas...',
      additionalReading: 'Recommended books, articles, websites...',
      discussionQuestions: 'Questions for discussion or reflection...',
      resourceType: 'e.g., Support Group, Helpline, Service',
      location: 'Physical location or service area...',
      contactInfo: 'Phone, email, website...',
      availability: 'Hours, days, or appointment requirements...',
      eligibility: 'Who can access this resource?',
      cost: 'Free, sliding scale, insurance accepted...',
      crisisType: 'e.g., Suicide, Domestic Violence, Substance Abuse',
      urgencyLevel: 'Low, Medium, High, Critical',
      safetyPlan: 'Specific safety planning steps...',
      followUpSteps: 'What happens after initial contact?',
      warningSigns: 'Signs to watch for...',
      assessmentType: 'e.g., Screening, Diagnostic, Outcome',
      scoringMethod: 'How is this assessment scored?',
      interpretation: 'How to interpret results...',
      validityInfo: 'Reliability and validity information...',
      ageRange: 'e.g., 18-65, Children 6-12',
      protocolType: 'e.g., CBT, DBT, EMDR',
      evidenceBase: 'Research supporting this protocol...',
      sessionCount: 'Number of recommended sessions',
      outcomeMeasures: 'How progress is measured...',
      contraindications: 'When not to use this protocol...',
      researchType: 'e.g., Meta-analysis, RCT, Case Study',
      authors: 'Author names and affiliations...',
      publicationDate: 'Date of publication...',
      journal: 'Journal or publication name...',
      doi: 'Digital Object Identifier...',
      abstract: 'Brief summary of the research...',
      keyFindings: 'Main findings and implications...',
      trainingLevel: 'e.g., Beginner, Intermediate, Advanced',
      certification: 'Certification or credential required...',
      prerequisites: 'Required knowledge or experience...',
      learningOutcomes: 'What participants will learn...',
      ceuCredits: 'Number of continuing education credits...',
      videoLength: 'e.g., 45 minutes, 2 hours',
      instructor: 'Instructor name and credentials...',
      topics: 'Topics covered in the video...',
      skillLevel: 'Required skill level...',
      certificate: 'Is a certificate provided?',
      guidelineType: 'e.g., Clinical, Administrative, Ethical',
      organization: 'Issuing organization...',
      lastUpdated: 'When was this last updated?',
      complianceLevel: 'Required, Recommended, Optional',
      implementation: 'Steps to implement these guidelines...',
      monitoring: 'How to monitor compliance...',
      legalType: 'e.g., HIPAA, State Law, Professional Ethics',
      jurisdiction: 'Applicable geographic area...',
      effectiveDate: 'When this becomes effective...',
      complianceRequirements: 'What is required for compliance...',
      penalties: 'Consequences of non-compliance...',
      resources: 'Additional resources for compliance...'
    };

    return category.fields
      .filter(field => !['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags'].includes(field))
      .map(field => (
        <div key={field} className="form-group">
          <label>{fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1)}</label>
          {field === 'urgencyLevel' || field === 'complianceLevel' || field === 'trainingLevel' || field === 'skillLevel' ? (
            <select
              value={resourceForm[field] || ''}
              onChange={(e) => setResourceForm(prev => ({ ...prev, [field]: e.target.value }))}
            >
              <option value="">Select {fieldLabels[field]}</option>
              {field === 'urgencyLevel' && (
                <>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </>
              )}
              {field === 'complianceLevel' && (
                <>
                  <option value="required">Required</option>
                  <option value="recommended">Recommended</option>
                  <option value="optional">Optional</option>
                </>
              )}
              {field === 'trainingLevel' && (
                <>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </>
              )}
              {field === 'skillLevel' && (
                <>
                  <option value="basic">Basic</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </>
              )}
            </select>
          ) : (
            <textarea
              value={resourceForm[field] || ''}
              onChange={(e) => setResourceForm(prev => ({ ...prev, [field]: e.target.value }))}
              placeholder={fieldPlaceholders[field] || `Enter ${field}...`}
              rows={3}
            />
          )}
        </div>
      ));
  };

  const filteredResources = resources.filter(resource => {
    const matchesSearch = resource.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filterCategory === 'all' || resource.category === filterCategory;
    return matchesSearch && matchesFilter;
  });

  const filteredWorksheets = worksheets.filter(worksheet => {
    const matchesSearch = worksheet.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         worksheet.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         worksheet.goal?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterCategory === 'all' || worksheet.category === filterCategory;
    return matchesSearch && matchesFilter;
  });

  const getCategoryIcon = (category) => {
    const CategoryIcon = categories[category]?.icon || BookOpen;
    return <CategoryIcon size={20} />;
  };

  const getTypeIcon = (type) => {
    const TypeIcon = resourceTypes[type]?.icon || FileText;
    return <TypeIcon size={16} />;
  };

  const getWorksheetCategoryIcon = (category) => {
    const categoryIcons = {
      'CBT': Brain,
      'DBT': Heart,
      'journaling': FileText,
      'moodTracking': Heart,
      'mindfulness': Brain,
      'anxiety': AlertTriangle,
      'depression': Heart,
      'trauma': Shield,
      'relationships': Users,
      'selfCare': Heart,
      'other': FileText
    };
    const CategoryIcon = categoryIcons[category] || FileText;
    return <CategoryIcon size={20} />;
  };

  // Check if current user can edit/delete resource
  const canEditResource = (resource) => {
    if (!currentUser) return false;
    return resource.therapistId === currentUser.uid || isAdmin;
  };

  // Check if current user can edit/delete worksheet
  const canEditWorksheet = (worksheet) => {
    if (!currentUser) return false;
    return worksheet.createdBy === currentUser.uid || isAdmin;
  };

  // Handle view resource
  const handleViewResource = (resource) => {
    if (resource.type === 'link' && resource.linkUrl) {
      window.open(resource.linkUrl, '_blank');
    } else if (resource.fileUrl) {
      window.open(resource.fileUrl, '_blank');
    } else {
      // Show content in a modal or new tab
      const contentWindow = window.open('', '_blank');
      contentWindow.document.write(`
        <html>
          <head><title>${resource.title}</title></head>
          <body>
            <h1>${resource.title}</h1>
            <p><strong>Description:</strong> ${resource.description}</p>
            <div><strong>Content:</strong></div>
            <div style="white-space: pre-wrap;">${resource.content || 'No content available'}</div>
          </body>
        </html>
      `);
    }
  };

  // Handle view worksheet
  const handleViewWorksheet = async (worksheet) => {
    setSelectedWorksheet(worksheet);
    setShowWorksheetViewModal(true);
    
    // Fetch client names for responses if any exist
    if (worksheet.clientResponses) {
      const clientIds = Object.keys(worksheet.clientResponses);
      if (clientIds.length > 0) {
        await fetchClientNames(clientIds);
      }
    }
  };

  // Get client responses for a worksheet
  const getClientResponses = (worksheet) => {
    return worksheet.clientResponses || {};
  };

  // Check if worksheet has any client responses
  const hasClientResponses = (worksheet) => {
    const responses = getClientResponses(worksheet);
    return Object.keys(responses).length > 0;
  };

  // Handle edit worksheet
  const handleEditWorksheet = (worksheet) => {
    setSelectedWorksheet(worksheet);
    setEditWorksheetForm({
      title: worksheet.title,
      description: worksheet.description,
      goal: worksheet.goal,
      instructions: worksheet.instructions,
      category: worksheet.category,
      type: worksheet.type,
      status: worksheet.status,
      fields: [...worksheet.fields],
      allowMultipleResponses: worksheet.allowMultipleResponses,
      assignedTo: [...worksheet.assignedTo]
    });
    setShowWorksheetEditModal(true);
  };

  // Handle update worksheet
  const handleUpdateWorksheet = async () => {
    try {
      if (!selectedWorksheet) return;

      const worksheetRef = doc(db, 'worksheets', selectedWorksheet.id);
      
      // Check if new fields were added
      const originalFieldCount = selectedWorksheet.fields.length;
      const newFieldCount = editWorksheetForm.fields.length;
      const hasNewFields = newFieldCount > originalFieldCount;
      
      // Prepare update data
      const updateData = {
        title: editWorksheetForm.title,
        description: editWorksheetForm.description,
        goal: editWorksheetForm.goal,
        instructions: editWorksheetForm.instructions,
        category: editWorksheetForm.category,
        type: editWorksheetForm.type,
        status: editWorksheetForm.status,
        fields: editWorksheetForm.fields,
        allowMultipleResponses: editWorksheetForm.allowMultipleResponses,
        assignedTo: editWorksheetForm.assignedTo,
        lastUpdated: serverTimestamp()
      };

      // If new fields were added, reset client completion status
      if (hasNewFields) {
        updateData.hasNewFields = true;
        updateData.newFieldsAddedAt = serverTimestamp();
        
        // Reset all client completion statuses
        const resetClientResponses = {};
        if (selectedWorksheet.clientResponses) {
          Object.keys(selectedWorksheet.clientResponses).forEach(clientId => {
            resetClientResponses[clientId] = {
              ...selectedWorksheet.clientResponses[clientId],
              status: 'pending',
              needsToCompleteNewFields: true
            };
          });
          updateData.clientResponses = resetClientResponses;
        }
      }

      await updateDoc(worksheetRef, updateData);
      
      alert('Worksheet updated successfully!');
      setShowWorksheetEditModal(false);
      setSelectedWorksheet(null);
      setEditWorksheetForm({
        title: '',
        description: '',
        goal: '',
        instructions: '',
        category: 'CBT',
        type: 'patient-facing',
        status: 'active',
        fields: [],
        allowMultipleResponses: true,
        assignedTo: []
      });
      
      // Refresh worksheets
      fetchWorksheets();
      
    } catch (error) {
      console.error('Error updating worksheet:', error);
      alert('Error updating worksheet. Please try again.');
    }
  };

  // Handle give feedback
  const handleGiveFeedback = (clientId) => {
    setSelectedClientForFeedback(clientId);
    setFeedbackForm({
      feedback: '',
      rating: 5
    });
    setShowFeedbackModal(true);
  };

  // Submit feedback
  const handleSubmitFeedback = async () => {
    try {
      if (!selectedWorksheet || !selectedClientForFeedback) return;

      const worksheetRef = doc(db, 'worksheets', selectedWorksheet.id);
      
      // Update the client's response with feedback
      await updateDoc(worksheetRef, {
        [`clientResponses.${selectedClientForFeedback}.feedback`]: {
          feedback: feedbackForm.feedback,
          rating: feedbackForm.rating,
          givenBy: currentUser.uid,
          givenAt: serverTimestamp()
        }
      });
      
      alert('Feedback submitted successfully!');
      setShowFeedbackModal(false);
      setSelectedClientForFeedback(null);
      setFeedbackForm({
        feedback: '',
        rating: 5
      });
      
      // Refresh worksheets to show updated feedback
      fetchWorksheets();
      
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Error submitting feedback. Please try again.');
    }
  };

  // Handle view resource
  const handleViewResourceModal = (resource) => {
    setSelectedResourceForView(resource);
    setShowResourceViewModal(true);
  };

  // Handle download worksheet as PDF
  const handleDownloadWorksheet = (worksheet) => {
    generateWorksheetPDF(worksheet);
  };

  // Check if all required fields are filled
  const isWorksheetFormValid = () => {
    return worksheetForm.title.trim() !== '' &&
           worksheetForm.description.trim() !== '' &&
           worksheetForm.goal.trim() !== '' &&
           worksheetForm.instructions.trim() !== '' &&
           worksheetForm.category !== '' &&
           worksheetForm.type !== '' &&
           worksheetForm.status !== '' &&
           worksheetForm.fields.length > 0 &&
           worksheetForm.fields.every(field => field.name.trim() !== '' && field.type !== '');
  };

  // Handle worksheet creation
  const handleCreateWorksheet = async () => {
    try {
      const worksheetData = {
        ...worksheetForm,
        createdBy: currentUser.uid,
        dateCreated: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      console.log('Creating worksheet with data:', worksheetData);
      console.log('Assigned to clients:', worksheetData.assignedTo);

      await addDoc(collection(db, 'worksheets'), worksheetData);
      setShowWorksheetModal(false);
      resetWorksheetForm();
      alert('Worksheet created successfully!');
    } catch (error) {
      console.error('Error creating worksheet:', error);
      alert('Error creating worksheet. Please try again.');
    }
  };

  // Reset worksheet form
  const resetWorksheetForm = () => {
    setWorksheetForm({
      title: '',
      description: '',
      goal: '',
      instructions: '',
      category: 'CBT',
      type: 'patient-facing',
      status: 'active',
      fields: [],
      allowMultipleResponses: true,
      assignedTo: []
    });
  };

  // Add worksheet field
  const addWorksheetField = () => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: [...prev.fields, { name: '', type: 'text', required: true, options: [] }]
    }));
  };

  // Remove worksheet field
  const removeWorksheetField = (index) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  // Update worksheet field
  const updateWorksheetField = (index, field, value) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === index ? { ...f, [field]: value } : f
      )
    }));
  };

  // Add option to field
  const addFieldOption = (fieldIndex) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { ...f, options: [...(f.options || []), ''] }
          : f
      )
    }));
  };

  // Remove option from field
  const removeFieldOption = (fieldIndex, optionIndex) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { ...f, options: f.options.filter((_, idx) => idx !== optionIndex) }
          : f
      )
    }));
  };

  // Update field option
  const updateFieldOption = (fieldIndex, optionIndex, value) => {
    setWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { 
              ...f, 
              options: f.options.map((opt, idx) => 
                idx === optionIndex ? value : opt
              )
            }
          : f
      )
    }));
  };

  // Edit form field functions
  const addEditWorksheetField = () => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: [...prev.fields, { name: '', type: 'text', required: true, options: [] }]
    }));
  };

  const removeEditWorksheetField = (index) => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  const updateEditWorksheetField = (index, field, value) => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === index ? { ...f, [field]: value } : f
      )
    }));
  };

  const addEditFieldOption = (fieldIndex) => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { ...f, options: [...(f.options || []), ''] }
          : f
      )
    }));
  };

  const removeEditFieldOption = (fieldIndex, optionIndex) => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { ...f, options: f.options.filter((_, idx) => idx !== optionIndex) }
          : f
      )
    }));
  };

  const updateEditFieldOption = (fieldIndex, optionIndex, value) => {
    setEditWorksheetForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => 
        i === fieldIndex 
          ? { 
              ...f, 
              options: f.options.map((opt, idx) => 
                idx === optionIndex ? value : opt
              )
            }
          : f
      )
    }));
  };

  // Handle download resource as PDF
  const handleDownloadResource = (resource) => {
    if (resource.fileUrl) {
      // For file resources, download the original file
      const link = document.createElement('a');
      link.href = resource.fileUrl;
      link.download = resource.fileName || resource.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (resource.type === 'link' && resource.linkUrl) {
      window.open(resource.linkUrl, '_blank');
    } else {
      // Generate PDF with book-like styling
      generateResourcePDF(resource);
    }
  };

  // Generate PDF with book-like styling
  const generateResourcePDF = (resource) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;
    let currentPage = 1;

    // Helper function to add watermark
    const addWatermark = () => {
      try {
        pdf.setGState(new pdf.GState({opacity: 0.1}));
        pdf.setFontSize(60);
        pdf.setTextColor(200, 200, 200);
        pdf.text('NessaHub', pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' });
        pdf.setGState(new pdf.GState({opacity: 1}));
      } catch (error) {
        console.log('Watermark not supported in this PDF version, continuing without watermark');
      }
    };

    // Helper function to add page numbers
    const addPageNumbers = () => {
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${currentPage}`, pageWidth - 30, pageHeight - 15);
    };

    // Add watermark to first page
    addWatermark();

    // Set font
    pdf.setFont('helvetica');

    // Title (Cover page style)
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text(resource.title, margin, yPosition + 20);
    yPosition += 40;

    // Subtitle/Description
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    const descriptionLines = pdf.splitTextToSize(resource.description || '', contentWidth);
    pdf.text(descriptionLines, margin, yPosition);
    yPosition += descriptionLines.length * 6 + 20;

    // Resource Info Box
    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, yPosition, contentWidth, 40, 'F');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    
    // Category and Type
    pdf.text(`Category: ${categories[resource.category]?.name || resource.category}`, margin + 5, yPosition + 10);
    pdf.text(`Type: ${resourceTypes[resource.type]?.name || resource.type}`, margin + 5, yPosition + 18);
    
    // Duration and Difficulty
    if (resource.duration) {
      pdf.text(`Duration: ${resource.duration}`, margin + 5, yPosition + 26);
    }
    if (resource.difficulty) {
      pdf.text(`Difficulty: ${difficultyLevels[resource.difficulty] || resource.difficulty}`, margin + 5, yPosition + 34);
    }
    
    yPosition += 50;

    // Content Section
    if (resource.content) {
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Content', margin, yPosition);
      yPosition += 15;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      const contentLines = pdf.splitTextToSize(resource.content, contentWidth);
      
      contentLines.forEach((line, index) => {
        if (yPosition > pageHeight - 30) {
          addPageNumbers();
          pdf.addPage();
          currentPage++;
          yPosition = margin;
          addWatermark();
        }
        pdf.text(line, margin, yPosition);
        yPosition += 6;
      });
      yPosition += 20;
    }

    // Category-specific content
    const categoryFields = categories[resource.category]?.fields || [];
    categoryFields.forEach(field => {
      if (resource[field] && field !== 'title' && field !== 'description' && field !== 'content' && field !== 'type' && field !== 'category' && field !== 'tags' && field !== 'difficulty' && field !== 'duration' && field !== 'targetAudience' && field !== 'isPublic') {
        if (yPosition > pageHeight - 30) {
          addPageNumbers();
          pdf.addPage();
          currentPage++;
          yPosition = margin;
          addWatermark();
        }
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        const fieldLabel = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        pdf.text(fieldLabel + ':', margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const fieldLines = pdf.splitTextToSize(resource[field].toString(), contentWidth);
        fieldLines.forEach(line => {
          if (yPosition > pageHeight - 30) {
            addPageNumbers();
            pdf.addPage();
            currentPage++;
            yPosition = margin;
            addWatermark();
          }
          pdf.text(line, margin, yPosition);
          yPosition += 5;
        });
        yPosition += 10;
      }
    });

    // Tags
    if (resource.tags && resource.tags.length > 0) {
      if (yPosition > pageHeight - 30) {
        addPageNumbers();
        pdf.addPage();
        currentPage++;
        yPosition = margin;
        addWatermark();
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Tags:', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(resource.tags.join(', '), margin, yPosition);
      yPosition += 15;
    }

    // Footer
    const footerY = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Created by: ${therapistNames[resource.therapistId] || resource.therapistName || 'Unknown'}`, margin, footerY);
    pdf.text(`Created: ${resource.createdAt?.toDate?.()?.toLocaleString() || 'Unknown'}`, pageWidth - margin - 60, footerY);

    // Add page numbers to final page
    addPageNumbers();

    // Download the PDF
    pdf.save(`${resource.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  // Generate PDF for worksheet with book-like styling
  const generateWorksheetPDF = (worksheet) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 25;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;
    let currentPage = 1;
    const totalPages = Math.ceil(worksheet.fields.length / 3) + 2; // Cover + instructions + fields

    // Helper function to add watermark
    const addWatermark = () => {
      try {
        pdf.setGState(new pdf.GState({opacity: 0.1}));
        pdf.setFontSize(60);
        pdf.setTextColor(200, 200, 200);
        pdf.text('NessaHub', pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' });
        pdf.setGState(new pdf.GState({opacity: 1}));
      } catch (error) {
        console.log('Watermark not supported in this PDF version, continuing without watermark');
      }
    };

    // Helper function to add page numbers
    const addPageNumbers = () => {
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${currentPage} of ${totalPages}`, pageWidth - 30, pageHeight - 15);
    };

    // Helper function to check if we need a new page
    const checkNewPage = (requiredSpace = 20) => {
      if (yPosition + requiredSpace > pageHeight - 30) {
        addPageNumbers();
        pdf.addPage();
        currentPage++;
        yPosition = margin;
        addWatermark();
        return true;
      }
      return false;
    };

    // Add watermark to all pages
    addWatermark();

    // Cover Page
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(worksheet.title, pageWidth / 2, yPosition + 40, { align: 'center' });
    yPosition += 60;

    // Category and Type
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Category: ${worksheetCategories[worksheet.category] || worksheet.category}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 20;
    pdf.text(`Type: ${worksheetTypes[worksheet.type] || worksheet.type}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 40;

    // Description
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    const descriptionLines = pdf.splitTextToSize(worksheet.description, contentWidth);
    descriptionLines.forEach(line => {
      pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;
    });
    yPosition += 30;

    // Goal
    if (worksheet.goal) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Goal:', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;
      pdf.setFont('helvetica', 'normal');
      const goalLines = pdf.splitTextToSize(worksheet.goal, contentWidth);
      goalLines.forEach(line => {
        pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 6;
      });
      yPosition += 20;
    }

    // Instructions
    if (worksheet.instructions) {
      checkNewPage(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Instructions:', margin, yPosition);
      yPosition += 15;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      const instructionLines = pdf.splitTextToSize(worksheet.instructions, contentWidth);
      instructionLines.forEach(line => {
        checkNewPage(8);
        pdf.text(line, margin, yPosition);
        yPosition += 6;
      });
      yPosition += 20;
    }

    // Worksheet Fields
    if (worksheet.fields && worksheet.fields.length > 0) {
      checkNewPage(30);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Worksheet Fields', margin, yPosition);
      yPosition += 20;

      worksheet.fields.forEach((field, index) => {
        checkNewPage(25);
        
        // Field header
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${index + 1}. ${field.name}`, margin, yPosition);
        if (field.required) {
          pdf.setFontSize(10);
          pdf.setTextColor(220, 38, 38);
          pdf.text('(Required)', margin + 80, yPosition);
          pdf.setTextColor(0, 0, 0);
        }
        yPosition += 8;

        // Field type
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Type: ${field.type}`, margin, yPosition);
        yPosition += 6;

        // Input area
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(margin, yPosition, contentWidth, 15);
        yPosition += 20;

        // Add some space between fields
        yPosition += 5;
      });
    }

    // Footer information
    checkNewPage(30);
    pdf.setFontSize(10);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Created by: ${therapistNames[worksheet.createdBy] || 'Unknown'}`, margin, yPosition);
    pdf.text(`Created: ${worksheet.dateCreated?.toDate?.()?.toLocaleString() || 'Unknown'}`, pageWidth - margin - 60, yPosition);
    yPosition += 10;
    pdf.text(`Status: ${worksheet.status}`, margin, yPosition);
    pdf.text(`Multiple Responses: ${worksheet.allowMultipleResponses ? 'Yes' : 'No'}`, pageWidth - margin - 80, yPosition);

    // Add page numbers to final page
    addPageNumbers();

    // Download the PDF
    pdf.save(`${worksheet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_worksheet.pdf`);
  };

  return (
    <div className="resources-dashboard">
      <div className="resources-header">
        <div className="header-content">
          <h1 className="page-title">Resources & Training Library</h1>
          <p className="subtitle">Access comprehensive clinical resources, training materials, and professional development tools</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={() => setShowWorksheetModal(true)}
            style={{ marginRight: '1rem' }}
          >
            <FileText size={16} />
            Create Worksheet
          </button>
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            Add Resource
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
          >
            <BookOpen size={20} />
            Resources ({filteredResources.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'worksheets' ? 'active' : ''}`}
            onClick={() => setActiveTab('worksheets')}
          >
            <FileText size={20} />
            Worksheets ({filteredWorksheets.length})
          </button>
        </div>
      </div>

      {/* Category Navigation - Hidden */}
      {/* <div className="category-nav">
        <div className="nav-tabs">
          {Object.entries(categories).map(([key, category]) => {
            const CategoryIcon = category.icon;
            return (
              <button
                key={key}
                className={`nav-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <CategoryIcon size={20} />
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>
      </div> */}

      {/* Search and Filters */}
      <div className="resources-controls">
        <div className="controls-container">
        <div className="search-section">
          <div className="search-input">
            <Search size={20} />
            <input
              type="text"
                placeholder={activeTab === 'worksheets' 
                  ? "Search worksheets by title, description, or goal..." 
                  : "Search resources by title, description, or tags..."
                }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-section">
          <Filter size={16} />
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
              {activeTab === 'worksheets' ? (
                Object.entries(worksheetCategories).map(([key, category]) => (
                  <option key={key} value={key}>{category}</option>
                ))
              ) : (
                Object.entries(categories).map(([key, category]) => (
              <option key={key} value={key}>{category.name}</option>
                ))
              )}
          </select>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="resources-grid">
        {activeTab === 'resources' ? (
          // Resources Tab
          filteredResources.map((resource) => (
          <div key={resource.id} className="resource-card">
            <div className="resource-header">
              <div className="resource-icon">
                {getCategoryIcon(resource.category)}
              </div>
              <div className="resource-type">
                {getTypeIcon(resource.type)}
                <span>{resourceTypes[resource.type]?.name || 'Document'}</span>
              </div>
            </div>
            
            <div className="resource-content">
              <h3 className="resource-title">{resource.title}</h3>
              <p className="resource-description">{resource.description}</p>
              
              <div className="resource-meta">
                <div className="meta-item">
                  <Clock size={14} />
                  <span>{resource.duration || 'N/A'}</span>
                </div>
                <div className="meta-item">
                  <Tag size={14} />
                  <span>{difficultyLevels[resource.difficulty] || 'Beginner'}</span>
                </div>
                <div className="meta-item">
                  <Users size={14} />
                  <span>{targetAudiences[resource.targetAudience] || 'All Clients'}</span>
                </div>
              </div>

              {resource.tags && resource.tags.length > 0 && (
                <div className="resource-tags">
                  {resource.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="tag">{tag}</span>
                  ))}
                  {resource.tags.length > 3 && (
                    <span className="tag-more">+{resource.tags.length - 3}</span>
                  )}
                </div>
              )}
              
              <div className="resource-creator">
                <span className="creator-label">Created by:</span>
                <span className="creator-name">{therapistNames[resource.therapistId] || resource.therapistName || 'Unknown'}</span>
              </div>
                
                <div className="resource-date">
                  <Clock size={14} />
                  <span>Created: {resource.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}</span>
              </div>
            </div>

            <div className="resource-actions">
              <button 
                className="btn-icon"
                  onClick={() => handleViewResourceModal(resource)}
                title="View Resource"
              >
                <Eye size={16} />
              </button>
              <button 
                className="btn-icon"
                onClick={() => openEditModal(resource)}
                title="Edit Resource"
                disabled={!canEditResource(resource)}
              >
                <Edit size={16} />
              </button>
              <button 
                className="btn-icon"
                onClick={() => handleDownloadResource(resource)}
                title="Download Resource"
              >
                <Download size={16} />
              </button>
              <button 
                className="btn-icon danger"
                onClick={() => handleDeleteResource(resource.id)}
                title="Delete Resource"
                disabled={!canEditResource(resource)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          ))
        ) : (
          // Worksheets Tab
          filteredWorksheets.map((worksheet) => (
            <div key={worksheet.id} className="resource-card worksheet-card">
              <div className="resource-header">
                <div className="resource-icon">
                  {getWorksheetCategoryIcon(worksheet.category)}
                </div>
                <div className="resource-type">
                  <FileText size={16} />
                  <span>Worksheet</span>
                </div>
              </div>
              
              <div className="resource-content">
                <h3 className="resource-title">{worksheet.title}</h3>
                <p className="resource-description">{worksheet.description}</p>
                
                <div className="resource-meta">
                  <div className="meta-item">
                    <Target size={14} />
                    <span>{worksheetCategories[worksheet.category] || worksheet.category}</span>
                  </div>
                  <div className="meta-item">
                    <Users size={14} />
                    <span>{worksheet.assignedTo?.length || 0} assigned</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={14} />
                    <span>{worksheet.status}</span>
                  </div>
                </div>

                {worksheet.goal && (
                  <div className="worksheet-goal">
                    <strong>Goal:</strong> {worksheet.goal}
                  </div>
                )}
                
                <div className="resource-creator">
                  <span className="creator-label">Created by:</span>
                  <span className="creator-name">{therapistNames[worksheet.createdBy] || 'Unknown'}</span>
                </div>
                
                <div className="resource-date">
                  <Clock size={14} />
                  <span>Created: {worksheet.dateCreated?.toDate?.()?.toLocaleDateString() || 'Unknown'}</span>
                </div>
              </div>

              <div className="resource-actions">
                <button 
                  className="btn-icon"
                  onClick={() => handleViewWorksheet(worksheet)}
                  title="View Worksheet"
                >
                  <Eye size={16} />
                </button>
                <button 
                  className="btn-icon"
                  onClick={() => {
                    // Edit worksheet - you can implement this
                    console.log('Edit worksheet:', worksheet);
                  }}
                  title="Edit Worksheet"
                  disabled={!canEditWorksheet(worksheet)}
                >
                  <Edit size={16} />
                </button>
                <button 
                  className="btn-icon"
                  onClick={() => handleDownloadWorksheet(worksheet)}
                  title="Download Worksheet as PDF"
                >
                  <Download size={16} />
                </button>
                <button 
                  className="btn-icon danger"
                  onClick={() => handleDeleteWorksheet(worksheet.id)}
                  title="Delete Worksheet"
                  disabled={!canEditWorksheet(worksheet)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Resource Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setSelectedResource(null);
          resetForm();
        }}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{showCreateModal ? 'Add New Resource' : 'Edit Resource'}</h2>
              <button 
                className="close-button"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedResource(null);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="resource-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Title</label>
                    <input
                      type="text"
                      value={resourceForm.title}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter resource title"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={resourceForm.category}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {Object.entries(categories).map(([key, category]) => (
                        <option key={key} value={key}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={resourceForm.description}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the resource and its purpose"
                    rows={3}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={resourceForm.type}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      {Object.entries(resourceTypes).map(([key, type]) => (
                        <option key={key} value={key}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Difficulty Level</label>
                    <select
                      value={resourceForm.difficulty}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, difficulty: e.target.value }))}
                    >
                      {Object.entries(difficultyLevels).map(([key, level]) => (
                        <option key={key} value={key}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Duration</label>
                    <input
                      type="text"
                      value={resourceForm.duration}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, duration: e.target.value }))}
                      placeholder="e.g., 30 minutes, 1 hour"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Target Audience Type</label>
                  <select
                    value={resourceForm.targetAudienceType || 'clients'}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, targetAudienceType: e.target.value, targetAudience: 'all' }))}
                  >
                    {Object.entries(targetAudienceTypes).map(([key, type]) => (
                      <option key={key} value={key}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Target Audience</label>
                  <select
                    value={resourceForm.targetAudience}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                  >
                    {resourceForm.targetAudienceType === 'therapists' ? (
                      Object.entries(therapistAudienceOptions).map(([key, audience]) => (
                      <option key={key} value={key}>{audience}</option>
                      ))
                    ) : (
                      Object.entries(targetAudiences).map(([key, audience]) => (
                        <option key={key} value={key}>{audience}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* File Upload Section for Video, Audio, Image */}
                {(resourceForm.type === 'video' || resourceForm.type === 'audio' || resourceForm.type === 'image') && (
                  <div className="form-group">
                    <label>Upload {resourceForm.type.charAt(0).toUpperCase() + resourceForm.type.slice(1)} File</label>
                    <div className="file-upload-section">
                      <input
                        type="file"
                        accept={resourceForm.type === 'video' ? 'video/*' : resourceForm.type === 'audio' ? 'audio/*' : 'image/*'}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            handleFileUpload(file);
                          }
                        }}
                        style={{ display: 'none' }}
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="btn-secondary">
                        <Upload size={16} />
                        Choose {resourceForm.type.charAt(0).toUpperCase() + resourceForm.type.slice(1)} File
                      </label>
                      {selectedFile && (
                        <div className="file-preview">
                          <span className="file-selected">
                            Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                          {resourceForm.type === 'image' && filePreview && (
                            <img src={filePreview} alt="Preview" className="image-preview" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Link URL Section for Link type */}
                {resourceForm.type === 'link' && (
                  <div className="form-group">
                    <label>Link URL</label>
                    <input
                      type="url"
                      value={resourceForm.linkUrl}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, linkUrl: e.target.value }))}
                      placeholder="https://example.com"
                    />
                  </div>
                )}

                {/* Client Selection for Specific Sharing */}
                {resourceForm.targetAudience === 'specific' && (
                  <div className="form-group">
                    <label>Select Specific Clients</label>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowClientSelection(true)}
                    >
                      <Users size={16} />
                      Choose {resourceForm.targetAudienceType === 'therapists' ? 'Therapists' : 'Clients'} ({resourceForm.targetAudienceType === 'therapists' ? selectedTherapists.length : selectedClients.length} selected)
                    </button>
                    {(resourceForm.targetAudienceType === 'therapists' ? selectedTherapists.length : selectedClients.length) > 0 && (
                      <div className="selected-clients">
                        <h4>Selected {resourceForm.targetAudienceType === 'therapists' ? 'Therapists' : 'Clients'}:</h4>
                        <div className="client-tags">
                          {resourceForm.targetAudienceType === 'therapists' ? (
                            selectedTherapists.map(therapist => (
                              <span key={therapist.id} className="client-tag">
                                {therapist.name || therapist.displayName || therapist.email}
                                <button
                                  type="button"
                                  onClick={() => handleTherapistSelection(therapist.id)}
                                  className="remove-client"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            selectedClients.map(clientId => {
                            const client = [...assignedClients, ...allClients].find(c => c.id === clientId);
                            return (
                              <span key={clientId} className="client-tag">
                                {client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown Client'}
                                <button
                                  type="button"
                                  onClick={() => handleClientSelection(clientId)}
                                  className="remove-client"
                                >
                                  ×
                                </button>
                              </span>
                            );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Content</label>
                  <textarea
                    value={resourceForm.content}
                    onChange={(e) => setResourceForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter the main content, instructions, or description of the resource"
                    rows={6}
                  />
                </div>

                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={resourceForm.tags.join(', ')}
                    onChange={(e) => setResourceForm(prev => ({ 
                      ...prev, 
                      tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
                    }))}
                    placeholder="anxiety, CBT, mindfulness, etc."
                  />
                </div>

                {/* Category-specific fields */}
                <div className="category-specific-fields">
                  <h4>{categories[resourceForm.category]?.name} Specific Fields</h4>
                  {renderCategoryFields()}
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={resourceForm.isPublic}
                      onChange={(e) => setResourceForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                    />
                    Make this resource public (visible to other therapists)
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedResource(null);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={showCreateModal ? handleCreateResource : handleUpdateResource}
              >
                {showCreateModal ? 'Create Resource' : 'Update Resource'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClientSelection && (
        <div className="modal-overlay client-selection-overlay" onClick={() => setShowClientSelection(false)}>
          <div className="modal-content large client-selection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {showWorksheetModal 
                  ? 'Select Clients for Worksheet' 
                  : resourceForm.targetAudienceType === 'therapists' 
                    ? 'Select Therapists' 
                    : 'Select Clients'
                }
              </h2>
              <button className="close-button" onClick={() => setShowClientSelection(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="client-selection">
                {showWorksheetModal ? (
                  // Worksheet client selection - only show clients
                  <>
                    {/* Assigned Clients Section */}
                    <div className="client-section">
                      <h3>Your Assigned Clients</h3>
                      <div className="client-list">
                        {assignedClients.map(client => (
                          <div key={client.id} className="client-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedClients.includes(client.id)}
                                onChange={() => handleClientSelection(client.id)}
                              />
                              <div className="client-info">
                                <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                                <span className="client-email">{client.email}</span>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Other Clients Section */}
                    <div className="client-section">
                      <h3>Other Clients</h3>
                      <div className="client-list">
                        {allClients.filter(client => !assignedClients.find(ac => ac.id === client.id)).map(client => (
                          <div key={client.id} className="client-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedClients.includes(client.id)}
                                onChange={() => handleClientSelection(client.id)}
                              />
                              <div className="client-info">
                                <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                                <span className="client-email">{client.email}</span>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : resourceForm.targetAudienceType === 'therapists' ? (
                  // Therapist Selection
                  <div className="client-section">
                    <h3>Available Therapists</h3>
                    <div className="client-list">
                      {allTherapists.filter(therapist => therapist.id !== currentUser?.uid).map(therapist => (
                        <div key={therapist.id} className="client-item">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedTherapists.some(t => t.id === therapist.id)}
                              onChange={() => handleTherapistSelection(therapist.id)}
                            />
                            <div className="client-info">
                              <span className="client-name">{therapist.name || therapist.displayName || therapist.email}</span>
                              <span className="client-email">{therapist.email}</span>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Client Selection
                  <>
                {/* Assigned Clients Section */}
                <div className="client-section">
                  <h3>Your Assigned Clients</h3>
                  <div className="client-list">
                    {assignedClients.map(client => (
                      <div key={client.id} className="client-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.id)}
                            onChange={() => handleClientSelection(client.id)}
                          />
                          <div className="client-info">
                            <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                            <span className="client-email">{client.email}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Other Clients Section */}
                <div className="client-section">
                  <h3>Other Clients</h3>
                  <div className="client-list">
                    {allClients.filter(client => !assignedClients.find(ac => ac.id === client.id)).map(client => (
                      <div key={client.id} className="client-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.id)}
                            onChange={() => handleClientSelection(client.id)}
                          />
                          <div className="client-info">
                            <span className="client-name">{client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown'}</span>
                            <span className="client-email">{client.email}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowClientSelection(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveClientSelection}>
                Save Selection ({showWorksheetModal 
                  ? selectedClients.length 
                  : resourceForm.targetAudienceType === 'therapists' 
                    ? selectedTherapists.length 
                    : selectedClients.length
                } {showWorksheetModal 
                  ? 'clients' 
                  : resourceForm.targetAudienceType === 'therapists' 
                    ? 'therapists' 
                    : 'clients'
                })
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Worksheet Modal */}
      {showWorksheetModal && (
        <div className="modal-overlay" onClick={() => setShowWorksheetModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Worksheet</h2>
              <button className="close-button" onClick={() => setShowWorksheetModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Title *</label>
                    <input
                      type="text"
                      value={worksheetForm.title}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., CBT Thought Record"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={worksheetForm.category}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {Object.entries(worksheetCategories).map(([key, category]) => (
                        <option key={key} value={key}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Type *</label>
                    <select
                      value={worksheetForm.type}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      {Object.entries(worksheetTypes).map(([key, type]) => (
                        <option key={key} value={key}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status *</label>
                    <select
                      value={worksheetForm.status}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, status: e.target.value }))}
                    >
                      {Object.entries(worksheetStatuses).map(([key, status]) => (
                        <option key={key} value={key}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>Description *</label>
                  <textarea
                    value={worksheetForm.description}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the worksheet purpose..."
                    rows="3"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Goal *</label>
                  <textarea
                    value={worksheetForm.goal}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, goal: e.target.value }))}
                    placeholder="What should clients achieve with this worksheet?"
                    rows="2"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Instructions *</label>
                  <textarea
                    value={worksheetForm.instructions}
                    onChange={(e) => setWorksheetForm(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Step-by-step instructions for completing the worksheet..."
                    rows="4"
                    required
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Worksheet Fields</h3>
                <p>Define the fields that clients will fill out in this worksheet.</p>
                
                {worksheetForm.fields.map((field, index) => (
                  <div key={index} className="field-config">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Field Name *</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateWorksheetField(index, 'name', e.target.value)}
                          placeholder="e.g., situation, automaticThoughts"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Field Type *</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateWorksheetField(index, 'type', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="radio">Radio Buttons</option>
                          <option value="rating">Rating (1-10)</option>
                          <option value="multiple-choice">Multiple Choice</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateWorksheetField(index, 'required', e.target.checked)}
                          />
                          Required Field
                        </label>
                      </div>
                      <div className="form-group">
                        <button
                          type="button"
                          className="btn-danger small"
                          onClick={() => removeWorksheetField(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Field Options for select, radio, multiple-choice */}
                    {(field.type === 'select' || field.type === 'radio' || field.type === 'multiple-choice') && (
                      <div className="field-options">
                        <label>Options:</label>
                        {field.options && field.options.map((option, optIndex) => (
                          <div key={optIndex} className="option-input">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateFieldOption(index, optIndex, e.target.value)}
                              placeholder={`Option ${optIndex + 1}`}
                            />
                            <button
                              type="button"
                              className="btn-danger small"
                              onClick={() => removeFieldOption(index, optIndex)}
                              disabled={field.options.length <= 1}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn-secondary small"
                          onClick={() => addFieldOption(index)}
                        >
                          + Add Option
                        </button>
                      </div>
                    )}

                    {/* Rating field specific options */}
                    {field.type === 'rating' && (
                      <div className="rating-options">
                        <label>Rating Scale:</label>
                        <div className="rating-scale-preview">
                          <span>1</span>
                          <div className="rating-dots">
                            {[1,2,3,4,5,6,7,8,9,10].map(num => (
                              <div key={num} className="rating-dot">{num}</div>
                            ))}
                          </div>
                          <span>10</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={addWorksheetField}
                >
                  <Plus size={16} />
                  Add Field
                </button>
              </div>

              <div className="form-section">
                <h3>Assignment Settings</h3>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={worksheetForm.allowMultipleResponses}
                      onChange={(e) => setWorksheetForm(prev => ({ ...prev, allowMultipleResponses: e.target.checked }))}
                    />
                    Allow Multiple Responses (clients can submit multiple times)
                  </label>
                </div>

                <div className="form-group">
                  <label>Assign to Clients</label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      // Pre-select clients that are already assigned to the worksheet
                      console.log('Opening client selection for worksheet. Current assignedTo:', worksheetForm.assignedTo);
                      setSelectedClients(worksheetForm.assignedTo);
                      setShowClientSelection(true);
                    }}
                  >
                    <Users size={16} />
                    Select Clients
                  </button>
                  {worksheetForm.assignedTo.length > 0 && (
                    <div className="selected-clients">
                      <h4>Assigned to {worksheetForm.assignedTo.length} client(s):</h4>
                      <div className="client-tags">
                        {worksheetForm.assignedTo.map(clientId => {
                          const client = [...assignedClients, ...allClients].find(c => c.id === clientId);
                          return (
                            <span key={clientId} className="client-tag">
                              {client?.displayName || client?.clientName || client?.name || client?.email || 'Unknown Client'}
                              <button
                                type="button"
                                onClick={() => {
                                  setWorksheetForm(prev => ({
                                    ...prev,
                                    assignedTo: prev.assignedTo.filter(id => id !== clientId)
                                  }));
                                }}
                                className="remove-client"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetModal(false)}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary ${!isWorksheetFormValid() ? 'disabled' : ''}`}
                onClick={handleCreateWorksheet}
                disabled={!isWorksheetFormValid()}
              >
                Create Worksheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource View Modal */}
      {showResourceViewModal && selectedResourceForView && (
        <div className="modal-overlay" onClick={() => setShowResourceViewModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedResourceForView.title}</h2>
              <button 
                className="close-button"
                onClick={() => setShowResourceViewModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="resource-view">
                {/* Resource Header */}
                <div className="resource-header-view">
                  <div className="resource-meta">
                    <div className="meta-item">
                      <div className="resource-icon">
                        {getCategoryIcon(selectedResourceForView.category)}
                      </div>
                      <span>{categories[selectedResourceForView.category]?.name || selectedResourceForView.category}</span>
                    </div>
                    <div className="meta-item">
                      <div className="resource-type">
                        {getTypeIcon(selectedResourceForView.type)}
                      </div>
                      <span>{resourceTypes[selectedResourceForView.type]?.name || selectedResourceForView.type}</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>{selectedResourceForView.duration || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                      <Tag size={16} />
                      <span>{difficultyLevels[selectedResourceForView.difficulty] || 'Beginner'}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="resource-section">
                  <h3>Description</h3>
                  <p>{selectedResourceForView.description}</p>
                </div>

                {/* Content */}
                {selectedResourceForView.content && (
                  <div className="resource-section">
                    <h3>Content</h3>
                    <div className="content-box">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selectedResourceForView.content}</p>
                    </div>
                  </div>
                )}

                {/* File/Link Information */}
                {selectedResourceForView.fileUrl && (
                  <div className="resource-section">
                    <h3>File Information</h3>
                    <div className="file-info">
                      <p><strong>File Name:</strong> {selectedResourceForView.fileName || 'Unknown'}</p>
                      <p><strong>File Size:</strong> {selectedResourceForView.fileSize ? `${(selectedResourceForView.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}</p>
                      <button 
                        className="btn-secondary"
                        onClick={() => window.open(selectedResourceForView.fileUrl, '_blank')}
                      >
                        <Download size={16} />
                        Download File
                      </button>
                    </div>
                  </div>
                )}

                {selectedResourceForView.linkUrl && (
                  <div className="resource-section">
                    <h3>Link Information</h3>
                    <div className="link-info">
                      <p><strong>URL:</strong> <a href={selectedResourceForView.linkUrl} target="_blank" rel="noopener noreferrer">{selectedResourceForView.linkUrl}</a></p>
                      <button 
                        className="btn-secondary"
                        onClick={() => window.open(selectedResourceForView.linkUrl, '_blank')}
                      >
                        <Link size={16} />
                        Open Link
                      </button>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedResourceForView.tags && selectedResourceForView.tags.length > 0 && (
                  <div className="resource-section">
                    <h3>Tags</h3>
                    <div className="tags-list">
                      {selectedResourceForView.tags.map((tag, index) => (
                        <span key={index} className="tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category-specific fields */}
                {(() => {
                  const categoryFields = categories[selectedResourceForView.category]?.fields || [];
                  const relevantFields = categoryFields.filter(field => 
                    selectedResourceForView[field] && 
                    !['title', 'description', 'type', 'difficulty', 'duration', 'targetAudience', 'content', 'tags', 'isPublic'].includes(field)
                  );
                  
                  if (relevantFields.length > 0) {
                    return (
                      <div className="resource-section">
                        <h3>{categories[selectedResourceForView.category]?.name} Specific Information</h3>
                        <div className="category-fields">
                          {relevantFields.map(field => (
                            <div key={field} className="field-item">
                              <strong>{field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong>
                              <p>{selectedResourceForView[field]}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Settings */}
                <div className="resource-section">
                  <h3>Settings</h3>
                  <div className="settings-grid">
                    <div className="setting-item">
                      <strong>Target Audience:</strong>
                      <span>{targetAudiences[selectedResourceForView.targetAudience] || selectedResourceForView.targetAudience}</span>
                    </div>
                    <div className="setting-item">
                      <strong>Public Resource:</strong>
                      <span className={selectedResourceForView.isPublic ? 'setting-enabled' : 'setting-disabled'}>
                        {selectedResourceForView.isPublic ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="setting-item">
                      <strong>Created by:</strong>
                      <span>{therapistNames[selectedResourceForView.therapistId] || selectedResourceForView.therapistName || 'Unknown'}</span>
                    </div>
                    <div className="setting-item">
                      <strong>Created:</strong>
                      <span>{selectedResourceForView.createdAt?.toDate?.()?.toLocaleString() || 'Unknown'}</span>
                    </div>
                    <div className="setting-item">
                      <strong>Last Updated:</strong>
                      <span>{selectedResourceForView.updatedAt?.toDate?.()?.toLocaleString() || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowResourceViewModal(false)}
              >
                Close
              </button>
              <button 
                className="btn-primary"
                onClick={() => handleDownloadResource(selectedResourceForView)}
              >
                <Download size={16} />
                Download as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worksheet View Modal */}
      {showWorksheetViewModal && selectedWorksheet && (
        <div className="modal-overlay" onClick={() => setShowWorksheetViewModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedWorksheet.title}</h2>
              <button 
                className="close-button"
                onClick={() => setShowWorksheetViewModal(false)}
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
                      <span>{worksheetCategories[selectedWorksheet.category] || selectedWorksheet.category}</span>
                    </div>
                    <div className="meta-item">
                      <Users size={16} />
                      <span>{selectedWorksheet.assignedTo?.length || 0} assigned clients</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>{selectedWorksheet.status}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="worksheet-section">
                  <h3>Description</h3>
                  <p>{selectedWorksheet.description}</p>
                </div>

                {/* Goal */}
                {selectedWorksheet.goal && (
                  <div className="worksheet-section">
                    <h3>Goal</h3>
                    <div className="goal-box">
                      <p>{selectedWorksheet.goal}</p>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                {selectedWorksheet.instructions && (
                  <div className="worksheet-section">
                    <h3>Instructions</h3>
                    <div className="instructions-box">
                      <p>{selectedWorksheet.instructions}</p>
                    </div>
                  </div>
                )}

                {/* Client Responses Section */}
                {hasClientResponses(selectedWorksheet) && (
                  <div className="worksheet-section">
                    <h3>Client Responses</h3>
                    <div className="client-responses-list">
                      {Object.entries(getClientResponses(selectedWorksheet)).map(([clientId, clientResponse]) => (
                        <div key={clientId} className="client-response-item">
                          <div className="client-response-header">
                            <h4>Client: {clientNames[clientId] || `Client ${clientId.slice(0, 8)}...`}</h4>
                            <span className={`status-badge ${clientResponse.status === 'completed' ? 'completed' : 'pending'}`}>
                              {clientResponse.status}
                            </span>
                          </div>
                          <div className="client-response-fields">
                            {selectedWorksheet.fields && selectedWorksheet.fields.map((field, index) => (
                              <div key={index} className="client-field-response">
                                <div className="client-field-header">
                                  <strong>{field.name}</strong>
                                  <span className="field-type-badge">{field.type}</span>
                                </div>
                                <div className="client-field-answer">
                                  {clientResponse.responses && clientResponse.responses[index] !== undefined ? (
                                    <span className="answer-text">
                                      {Array.isArray(clientResponse.responses[index]) 
                                        ? clientResponse.responses[index].join(', ')
                                        : clientResponse.responses[index].toString()
                                      }
                                    </span>
                                  ) : (
                                    <span className="no-answer">No answer provided</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="client-response-meta">
                            <span className="submission-date">
                              Submitted: {clientResponse.submittedAt?.toDate?.()?.toLocaleString() || 'Unknown'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Worksheet Fields */}
                {selectedWorksheet.fields && selectedWorksheet.fields.length > 0 && (
                  <div className="worksheet-section">
                    <h3>Worksheet Fields</h3>
                    <div className="fields-list">
                      {selectedWorksheet.fields.map((field, index) => (
                        <div key={index} className="field-item">
                          <div className="field-header">
                            <span className="field-number">{index + 1}.</span>
                            <span className="field-name">{field.name}</span>
                            {field.required && (
                              <span className="required-badge">Required</span>
                            )}
                          </div>
                          <div className="field-details">
                            <span className="field-type">Type: {field.type}</span>
                          </div>
                          <div className="field-input-preview">
                            {field.type === 'rating' ? (
                              <div className="rating-preview">
                                <span>1</span>
                                <div className="rating-dots">
                                  {[1,2,3,4,5,6,7,8,9,10].map(num => (
                                    <div key={num} className="rating-dot">{num}</div>
                                  ))}
                                </div>
                                <span>10</span>
                              </div>
                            ) : field.type === 'multiple-choice' ? (
                              <div className="multiple-choice-preview">
                                {field.options && field.options.slice(0, 3).map((option, optIndex) => (
                                  <div key={optIndex} className="choice-option">☐ {option}</div>
                                ))}
                                {field.options && field.options.length > 3 && (
                                  <div className="choice-option">... and {field.options.length - 3} more</div>
                                )}
                              </div>
                            ) : field.type === 'select' ? (
                              <div className="select-preview">
                                <select disabled>
                                  <option>Select an option...</option>
                                  {field.options && field.options.map((option, optIndex) => (
                                    <option key={optIndex}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            ) : field.type === 'radio' ? (
                              <div className="radio-preview">
                                {field.options && field.options.slice(0, 2).map((option, optIndex) => (
                                  <div key={optIndex} className="radio-option">○ {option}</div>
                                ))}
                                {field.options && field.options.length > 2 && (
                                  <div className="radio-option">... and {field.options.length - 2} more</div>
                                )}
                              </div>
                            ) : (
                              <div className="input-placeholder">
                                {field.type === 'textarea' ? 'Long text input area...' : 
                                 field.type === 'checkbox' ? '☐ Checkbox option' :
                                 field.type === 'date' ? 'Date picker...' :
                                 field.type === 'number' ? 'Number input...' :
                                 'Text input...'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings */}
                <div className="worksheet-section">
                  <h3>Settings</h3>
                  <div className="settings-grid">
                    <div className="setting-item">
                      <strong>Multiple Responses:</strong>
                      <span className={selectedWorksheet.allowMultipleResponses ? 'setting-enabled' : 'setting-disabled'}>
                        {selectedWorksheet.allowMultipleResponses ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="setting-item">
                      <strong>Created by:</strong>
                      <span>{therapistNames[selectedWorksheet.createdBy] || 'Unknown'}</span>
                    </div>
                    <div className="setting-item">
                      <strong>Created:</strong>
                      <span>{selectedWorksheet.dateCreated?.toDate?.()?.toLocaleString() || 'Unknown'}</span>
                    </div>
                    <div className="setting-item">
                      <strong>Last Updated:</strong>
                      <span>{selectedWorksheet.lastUpdated?.toDate?.()?.toLocaleString() || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetViewModal(false)}
              >
                Close
              </button>
              <button 
                className="btn-primary"
                onClick={() => handleEditWorksheet(selectedWorksheet)}
              >
                <Edit size={16} />
                Edit Worksheet
              </button>
              <button 
                className="btn-secondary"
                onClick={() => handleDownloadWorksheet(selectedWorksheet)}
              >
                <Download size={16} />
                Download as PDF
              </button>
              {hasClientResponses(selectedWorksheet) && (
                <button 
                  className="btn-success"
                  onClick={() => {
                    const clientIds = Object.keys(getClientResponses(selectedWorksheet));
                    if (clientIds.length > 0) {
                      handleGiveFeedback(clientIds[0]); // Give feedback to first client for now
                    }
                  }}
                >
                  <MessageCircle size={16} />
                  Give Feedback
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Worksheet Modal */}
      {showWorksheetEditModal && selectedWorksheet && (
        <div className="modal-overlay" onClick={() => setShowWorksheetEditModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Worksheet: {selectedWorksheet.title}</h2>
              <button 
                className="close-button"
                onClick={() => setShowWorksheetEditModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={editWorksheetForm.title}
                  onChange={(e) => setEditWorksheetForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter worksheet title"
                />
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={editWorksheetForm.description}
                  onChange={(e) => setEditWorksheetForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose of this worksheet"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Goal</label>
                <textarea
                  value={editWorksheetForm.goal}
                  onChange={(e) => setEditWorksheetForm(prev => ({ ...prev, goal: e.target.value }))}
                  placeholder="What should clients achieve with this worksheet?"
                  rows="2"
                />
              </div>

              <div className="form-group">
                <label>Instructions</label>
                <textarea
                  value={editWorksheetForm.instructions}
                  onChange={(e) => setEditWorksheetForm(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Instructions for clients on how to complete this worksheet"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={editWorksheetForm.category}
                  onChange={(e) => setEditWorksheetForm(prev => ({ ...prev, category: e.target.value }))}
                >
                  <option value="CBT">CBT</option>
                  <option value="DBT">DBT</option>
                  <option value="Mindfulness">Mindfulness</option>
                  <option value="Trauma">Trauma</option>
                  <option value="Anxiety">Anxiety</option>
                  <option value="Depression">Depression</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Fields/Questions</label>
                <div className="fields-list">
                  {editWorksheetForm.fields.map((field, index) => (
                    <div key={index} className="field-item">
                      <div className="field-header">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateEditWorksheetField(index, 'name', e.target.value)}
                          placeholder="Field/question name"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateEditWorksheetField(index, 'type', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Dropdown</option>
                          <option value="radio">Radio Buttons</option>
                          <option value="checkbox">Checkboxes</option>
                          <option value="rating">Rating Scale</option>
                          <option value="multiple-choice">Multiple Choice</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeEditWorksheetField(index)}
                          className="btn-danger btn-sm"
                        >
                          Remove
                        </button>
                      </div>
                      
                      <div className="field-details">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateEditWorksheetField(index, 'required', e.target.checked)}
                          />
                          Required
                        </label>
                      </div>

                      {/* Field Options */}
                      {(field.type === 'select' || field.type === 'radio' || field.type === 'multiple-choice') && (
                        <div className="field-options">
                          <label>Options:</label>
                          {field.options?.map((option, optionIndex) => (
                            <div key={optionIndex} className="option-input">
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => updateEditFieldOption(index, optionIndex, e.target.value)}
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeEditFieldOption(index, optionIndex)}
                                className="btn-danger btn-sm"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addEditFieldOption(index)}
                            className="btn-secondary btn-sm"
                          >
                            Add Option
                          </button>
                        </div>
                      )}

                      {/* Rating Preview */}
                      {field.type === 'rating' && (
                        <div className="rating-preview">
                          <span>Rating Scale (1-10):</span>
                          <div className="rating-scale-preview">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                              <span key={num} className="rating-dot">{num}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <button
                    type="button"
                    onClick={addEditWorksheetField}
                    className="btn-secondary"
                  >
                    <Plus size={16} />
                    Add Field
                  </button>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowWorksheetEditModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={handleUpdateWorksheet}
              >
                <Save size={16} />
                Update Worksheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && selectedClientForFeedback && (
        <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Give Feedback to {clientNames[selectedClientForFeedback] || `Client ${selectedClientForFeedback.slice(0, 8)}...`}</h2>
              <button 
                className="close-button"
                onClick={() => setShowFeedbackModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Rating (1-10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={feedbackForm.rating}
                  onChange={(e) => setFeedbackForm(prev => ({ ...prev, rating: parseInt(e.target.value) }))}
                />
              </div>

              <div className="form-group">
                <label>Feedback</label>
                <textarea
                  value={feedbackForm.feedback}
                  onChange={(e) => setFeedbackForm(prev => ({ ...prev, feedback: e.target.value }))}
                  placeholder="Provide feedback on the client's responses..."
                  rows="5"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowFeedbackModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={handleSubmitFeedback}
              >
                <Send size={16} />
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
